// Modelo de puestos del parqueadero: listado y ajuste del total.
import pool from "@/lib/db";
import { ErrorDominio } from "./errores";

// Lista puestos vigentes con el vehículo que los ocupa (contrato vigente o
// ticket abierto). El dueño del puesto se resuelve en una sola CTE: mensual
// prioriza sobre diario si ambos apuntan al mismo. `estado_puesto` se deriva
// de la existencia real del ocupante, no de la columna, que puede quedar
// desincronizada si un vehículo se soft-deletea sin liberar.
//
// El JOIN a `vehiculos` exige estado 'activo': un mensual inactivado (o un
// diario sin ticket) deja de aparecer en el mapa aunque su contrato siga
// vigente. El puesto se ve como libre en el grid, pero el contrato queda en BD
// para reactivarse.
//
// La CTE arrastra además las condiciones económicas que el mapa muestra en su
// tooltip: para contratos (precio, dia_pago, pagado) y para tickets (pagado).
// Los tickets sólo exponen `pagado`; los otros campos van NULL.
//
// `pagado` de contrato se calcula contra el mes en curso (columna pagado_mes):
// al cambiar de mes, el bool histórico deja de contar aunque siga en TRUE.
export async function listarPuestos() {
  const { rows } = await pool.query(`
    WITH ocupacion AS (
      SELECT puestos_id_puesto AS id_puesto, vehiculos_placa AS placa,
             1 AS prioridad, fecha_inicio AS ingreso,
             precio, dia_pago,
             (pagado AND pagado_mes = TO_CHAR(NOW(), 'YYYY-MM')) AS pagado
      FROM contratos
      WHERE fecha_eliminado IS NULL AND fecha_fin > NOW()
      UNION ALL
      SELECT puestos_id_puesto, vehiculos_placa, 2, fecha_ingreso,
             NULL::numeric, NULL::smallint, pagado
      FROM tickets
      WHERE fecha_salida IS NULL AND fecha_eliminado IS NULL
    ),
    vigente AS (
      SELECT DISTINCT ON (id_puesto)
             id_puesto, placa, ingreso, precio, dia_pago, pagado
      FROM ocupacion
      ORDER BY id_puesto, prioridad, ingreso DESC
    )
    SELECT
      p.id_puesto::text AS id,
      p.numero_puesto,
      (v.placa IS NOT NULL) AS estado_puesto,
      CASE WHEN v.placa IS NULL THEN NULL ELSE json_build_object(
        'placa',          v.placa,
        'doc',            u.documento::text,
        'nombre',         u.nombre,
        'telefono',       u.telefono,
        'color',          v.color,
        'tipo',           t.tipo_vehiculo,
        'tipo_nombre',    tv.nombre,
        'tipo_icono',     tv.icono,
        'clase_vehiculo', tv.nombre,
        'ingreso',        TO_CHAR(r.ingreso, 'DD-MM-YYYY HH24:MI'),
        'precio',         r.precio,
        'dia_pago',       r.dia_pago,
        'pagado',         COALESCE(r.pagado, FALSE)
      ) END AS "vehiculoActual"
    FROM puestos p
    LEFT JOIN vigente   r  ON r.id_puesto = p.id_puesto
    LEFT JOIN vehiculos v  ON v.placa = r.placa
                          AND v.fecha_eliminado IS NULL
                          AND v.estados_id_estado = (
                                SELECT id_estado FROM estados
                                WHERE nombre_estado = 'activo'
                              )
    LEFT JOIN usuarios  u  ON u.documento = v.usuarios_documento
    LEFT JOIN tarifa    t  ON t.id_tarifa = v.tarifa_id_tarifa
    LEFT JOIN tipos_vehiculo tv ON tv.id_tipo_vehiculo = t.tipo_vehiculo_id
    WHERE p.fecha_eliminado IS NULL
    ORDER BY p.numero_puesto
  `);
  return rows;
}

// Ajusta el total de puestos al número objetivo (1..1000).
// - No permite reducir por debajo de los ocupados.
// - Si crece: reactiva primero los soft-deleted de menor número; si sobran
//   objetivos, añade puestos consecutivos al máximo vigente.
// - Si decrece: marca como eliminados los últimos puestos libres.
//
// Todo el flujo va en una transacción con pg_advisory_xact_lock para blindar
// dos carreras:
//   1. Dos ajustes concurrentes leyendo el mismo COUNT y calculando deltas
//      contradictorios (uno insertaría sobre el total que el otro está por borrar).
//   2. La rama de crecimiento usa `MAX(numero_puesto)`: sin lock, dos inserts
//      simultáneos leen el mismo MAX y duplican números.
//
// Antes era `LOCK TABLE puestos IN SHARE ROW EXCLUSIVE MODE`, que además de
// serializar los ajustes bloqueaba cualquier UPDATE de puestos (crearTicket,
// cerrarTicket). El advisory lock sólo serializa los ajustes entre sí; el
// lock de tabla era un martillo desproporcionado para ese caso.
export async function ajustarTotalPuestos(objetivo: number) {
  if (!objetivo || Number.isNaN(objetivo) || objetivo < 1 || objetivo > 1000) {
    throw new ErrorDominio("El total debe estar entre 1 y 1000", 400);
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    // Serializa sólo contra otros ajustes. Se libera al COMMIT/ROLLBACK.
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('ajustar_puestos'))");

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
