import pool from "@/lib/db";

export async function obtenerIndicadores() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM vehiculos WHERE fecha_eliminado IS NULL)::int AS total_vehiculos,
      (SELECT COUNT(*)
       FROM contratos c
       WHERE c.fecha_eliminado IS NULL
         AND c.fecha_fin > NOW())::int AS mensuales,
      (SELECT COUNT(*)
       FROM tickets t
       WHERE t.fecha_eliminado IS NULL
         AND t.fecha_salida IS NULL)::int AS diarios,
      (SELECT COUNT(*) FROM puestos WHERE estado_puesto = TRUE)::int AS puestos_ocupados
  `);

  return rows[0];
}

export async function obtenerIngresosSemanales() {
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS total, EXTRACT(ISODOW FROM t.fecha)::int AS dow
    FROM (
      SELECT fecha_ingreso AS fecha FROM tickets WHERE fecha_eliminado IS NULL
      UNION ALL
      SELECT fecha_inicio AS fecha FROM contratos WHERE fecha_eliminado IS NULL
    ) t
    WHERE t.fecha >= date_trunc('week', NOW())
    GROUP BY dow
  `);

  const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return dias.map((dia, index) => ({
    dia,
    total: rows.find(r => r.dow === index + 1)?.total || 0,
  }));
}
