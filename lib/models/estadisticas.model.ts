// Modelo de estadísticas. Agrega datos de vehículos, contratos, tickets y puestos.
//
// Las columnas mantenidas en escritura son la fuente de verdad de los
// indicadores:
//   - `vehiculos.estados_id_estado`  → "está en el parqueadero".
//   - `puestos.estado_puesto`        → "está ocupado".
// Se mantienen desde crearTicket/cerrarTicket/finalizarTicket,
// registrarVehiculoMensual, actualizarVehiculo, eliminarVehiculoSoft y el
// recálculo del seed. Antes este modelo reconstruía ambos estados con UNIONs
// de contratos×puestos y tickets×puestos (4 escaneos y 3 JOINs por dashboard).
import pool from "@/lib/db";

// Indicadores principales del dashboard. Un solo round-trip:
//   - total_vehiculos / activos: consolidados en un único scan de vehiculos
//     con COUNT(*) FILTER.
//   - mensuales: contratos vigentes (fecha_fin > NOW()).
//   - diarios: tickets con salida pendiente.
//   - puestos_ocupados: lee la columna mantenida; sin staleness en serverless,
//     el seed la recalcula al arrancar y obtenerIndicadores no la necesita viva.
//   - total_puestos: base para calcular disponibilidad.
export async function obtenerIndicadores() {
  const { rows } = await pool.query(`
    SELECT
      v.total_vehiculos,
      v.activos,
      (SELECT COUNT(*)
       FROM puestos
       WHERE fecha_eliminado IS NULL AND estado_puesto = TRUE)::int AS puestos_ocupados,
      (SELECT COUNT(*) FROM puestos WHERE fecha_eliminado IS NULL)::int AS total_puestos,
      (SELECT COUNT(*)
       FROM contratos c
       WHERE c.fecha_eliminado IS NULL
         AND c.fecha_fin > NOW())::int AS mensuales,
      (SELECT COUNT(*)
       FROM tickets t
       WHERE t.fecha_eliminado IS NULL
         AND t.fecha_salida IS NULL)::int AS diarios
    FROM (
      SELECT
        COUNT(*)::int AS total_vehiculos,
        COUNT(*) FILTER (WHERE v.estados_id_estado = (
          SELECT id_estado FROM estados WHERE nombre_estado = 'activo'
        ))::int AS activos
      FROM vehiculos v
      WHERE v.fecha_eliminado IS NULL
    ) v
  `);

  return rows[0];
}

// Actividad semanal: una barra por día ISO (Lun→Dom) de la semana en curso.
// Cuenta tickets y contratos CREADOS ese día (fecha_ingreso / fecha_inicio),
// sin filtrar por fecha_eliminado: el gráfico mide actividad histórica, no
// el snapshot vigente. `generate_series` garantiza las 7 filas y el mapeo se
// hace por posición — inmune a que el driver devuelva `dow` como string o
// number según el OID del parser.
export async function obtenerIngresosSemanales() {
  const { rows } = await pool.query(`
    WITH semana AS (
      SELECT gs::date AS dia
      FROM generate_series(
        date_trunc('week', NOW()),
        date_trunc('week', NOW()) + INTERVAL '6 days',
        INTERVAL '1 day'
      ) AS gs
    ),
    eventos AS (
      SELECT fecha_ingreso::date AS dia FROM tickets
      UNION ALL
      SELECT fecha_inicio::date  AS dia FROM contratos
    )
    SELECT s.dia, COUNT(e.dia)::int AS total
    FROM semana s
    LEFT JOIN eventos e ON e.dia = s.dia
    GROUP BY s.dia
    ORDER BY s.dia
  `);

  const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return dias.map((dia, i) => ({
    dia,
    total: Number(rows[i]?.total ?? 0),
  }));
}
