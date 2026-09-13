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
      AND t.fecha <  date_trunc('week', NOW()) + INTERVAL '1 week'
    GROUP BY dow
  `);

  const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return dias.map((dia, index) => ({
    dia,
    total: rows.find(r => r.dow === index + 1)?.total || 0,
  }));
}
