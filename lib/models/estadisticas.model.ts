// Modelo de estadísticas. Agrega datos de vehículos, contratos, tickets y puestos.
import pool from "@/lib/db";

// Indicadores principales del dashboard:
//   - total_vehiculos: vehículos activos (no soft-deleted).
//   - mensuales: contratos activos (fecha_fin > NOW()).
//   - diarios: tickets abiertos (fecha_salida IS NULL).
//   - puestos_ocupados: derivado de contratos vigentes + tickets abiertos.
//     No se confía en puestos.estado_puesto porque puede desincronizarse.
//   - total_puestos: total de puestos vigentes (para calcular disponibilidad real).
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
      -- Un puesto está ocupado si tiene contrato vigente o ticket abierto.
      -- No dependemos de puestos.estado_puesto, que puede quedar huérfano.
      (SELECT COUNT(DISTINCT p.id_puesto)
       FROM puestos p
       WHERE p.fecha_eliminado IS NULL
         AND (
           EXISTS (
             SELECT 1 FROM contratos c
             WHERE c.puestos_id_puesto = p.id_puesto
               AND c.fecha_eliminado IS NULL
               AND c.fecha_fin > NOW()
           )
           OR EXISTS (
             SELECT 1 FROM tickets t
             WHERE t.puestos_id_puesto = p.id_puesto
               AND t.fecha_salida IS NULL
               AND t.fecha_eliminado IS NULL
           )
         ))::int AS puestos_ocupados,
      (SELECT COUNT(*) FROM puestos WHERE fecha_eliminado IS NULL)::int AS total_puestos
  `);

  return rows[0];
}

// Conteo por día ISO de la semana actual, sumando tickets y contratos creados.
// Devuelve siempre 7 elementos (Lun→Dom), rellenando con 0 los días sin datos.
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
