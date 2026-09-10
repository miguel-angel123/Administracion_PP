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
// - Si crece: añade puestos consecutivos al máximo actual.
// - Si decrece: marca como eliminados los últimos puestos libres.
export async function ajustarTotalPuestos(objetivo: number) {
  if (!objetivo || Number.isNaN(objetivo) || objetivo < 1 || objetivo > 1000) {
    throw new ErrorDominio("El total debe estar entre 1 y 1000", 400);
  }

  const actual = await pool.query(
    `SELECT COUNT(*)::int AS total FROM puestos WHERE fecha_eliminado IS NULL`
  );
  const ocupados = await pool.query(
    `SELECT COUNT(*)::int AS total FROM puestos
     WHERE fecha_eliminado IS NULL AND estado_puesto = TRUE`
  );

  const actuales = actual.rows[0].total;
  const enUso = ocupados.rows[0].total;

  if (objetivo === actuales) return { total: actuales };

  if (objetivo < enUso) {
    throw new ErrorDominio(
      `No se puede reducir por debajo de los puestos en uso (${enUso}).`,
      409
    );
  }

  if (objetivo > actuales) {
    const faltan = objetivo - actuales;
    await pool.query(
      `INSERT INTO puestos(numero_puesto, estado_puesto)
       SELECT (SELECT COALESCE(MAX(numero_puesto),0) FROM puestos) + gs, FALSE
       FROM generate_series(1, $1) AS gs`,
      [faltan]
    );
  } else {
    await pool.query(
      `UPDATE puestos SET fecha_eliminado = NOW()
       WHERE id_puesto IN (
         SELECT id_puesto FROM puestos
         WHERE fecha_eliminado IS NULL AND estado_puesto = FALSE
         ORDER BY numero_puesto DESC
         LIMIT $1
       )`,
      [actuales - objetivo]
    );
  }

  return { total: objetivo };
}
