// Modelo de puestos del parqueadero: listado y ajuste del total.
import pool from "@/lib/db";
import { ErrorDominio } from "./errores";

// Todos los puestos vigentes (no soft-deleted), ordenados por número.
export async function listarPuestos() {
  const { rows } = await pool.query(`
    SELECT id_puesto::text AS id, numero_puesto, estado_puesto
    FROM puestos
    WHERE fecha_eliminado IS NULL
    ORDER BY numero_puesto
  `);

  return rows;
}

// Ajusta el total de puestos al número objetivo (1..1000).
// - No permite reducir por debajo de los ocupados.
// - Si crece: reactiva primero los soft-deleted de menor número; si sobran
//   objetivos, añade puestos consecutivos al máximo vigente.
// - Si decrece: marca como eliminados los últimos puestos libres.
//
// Todo el flujo va en una transacción con LOCK TABLE para blindar dos carreras:
//   1. Dos ajustes concurrentes leyendo el mismo COUNT y calculando deltas
//      contradictorios (uno insertaría sobre el total que el otro está por borrar).
//   2. La rama de crecimiento usa `MAX(numero_puesto)`: sin lock, dos inserts
//      simultáneos leen el mismo MAX y duplican números.
// SHARE ROW EXCLUSIVE bloquea INSERT/UPDATE/DELETE de otras sesiones sobre la
// tabla, pero deja pasar SELECTs concurrentes (los listados siguen vivos).
export async function ajustarTotalPuestos(objetivo: number) {
  if (!objetivo || Number.isNaN(objetivo) || objetivo < 1 || objetivo > 1000) {
    throw new ErrorDominio("El total debe estar entre 1 y 1000", 400);
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    await cliente.query("LOCK TABLE puestos IN SHARE ROW EXCLUSIVE MODE");

    // Un solo scan con FILTER calcula ambos contadores (antes eran dos SELECTs).
    const res = await cliente.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE estado_puesto = TRUE)::int AS ocupados
       FROM puestos
       WHERE fecha_eliminado IS NULL`
    );
    const actuales = res.rows[0].total;
    const enUso = res.rows[0].ocupados;

    if (objetivo === actuales) {
      await cliente.query("COMMIT");
      return { total: actuales };
    }

    if (objetivo < enUso) {
      throw new ErrorDominio(
        `No se puede reducir por debajo de los puestos en uso (${enUso}).`,
        409
      );
    }

    if (objetivo > actuales) {
      const faltan = objetivo - actuales;

      // Reactiva primero los soft-deleted de menor número: los huecos históricos
      // se reutilizan antes de crear filas nuevas. Sin esto, cada ciclo
      // reducir→aumentar dejaba un rango huérfano en la tabla (el MAX sin filtro
      // arrancaba donde terminaba el último soft-deleted, dejando huecos).
      const reactivar = await cliente.query(
        `UPDATE puestos SET fecha_eliminado = NULL, estado_puesto = FALSE
         WHERE id_puesto IN (
           SELECT id_puesto FROM puestos
           WHERE fecha_eliminado IS NOT NULL
           ORDER BY numero_puesto ASC
           LIMIT $1
         )`,
        [faltan]
      );

      const reutilizados = reactivar.rowCount ?? 0;
      const restantes = faltan - reutilizados;

      if (restantes > 0) {
        // MAX solo sobre vigentes: la numeración arranca donde termina la activa,
        // no donde terminaba antes de reducir.
        await cliente.query(
          `INSERT INTO puestos(numero_puesto, estado_puesto)
           SELECT (
             SELECT COALESCE(MAX(numero_puesto), 0) FROM puestos
             WHERE fecha_eliminado IS NULL
           ) + gs, FALSE
           FROM generate_series(1, $1) AS gs`,
          [restantes]
        );
      }
    } else {
      const aEliminar = actuales - objetivo;
      const upd = await cliente.query(
        `UPDATE puestos SET fecha_eliminado = NOW()
         WHERE id_puesto IN (
           SELECT id_puesto FROM puestos
           WHERE fecha_eliminado IS NULL AND estado_puesto = FALSE
           ORDER BY numero_puesto DESC
           LIMIT $1
         )
         RETURNING id_puesto`,
        [aEliminar]
      );

      // Si por lo que sea la cantidad de libres no alcanzó, se aborta entero.
      // Reportar éxito con un total distinto al real sería peor que fallar.
      if (upd.rowCount !== aEliminar) {
        throw new ErrorDominio(
          `Solo se pudieron eliminar ${upd.rowCount} de ${aEliminar} puestos`,
          409
        );
      }
    }

    await cliente.query("COMMIT");
    return { total: objetivo };
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
}
