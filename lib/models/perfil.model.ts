// Modelo de perfil. Devuelve datos del cliente que consulta: vehículos e historial.
import pool from "@/lib/db";

// Vehículos del cliente. Cada LATERAL resuelve su propia consulta en un solo
// viaje por fila: antes eran tres subconsultas correlacionadas en el SELECT.
//   - ult_contrato: último contrato no soft-deleted (inicio y fin vienen de la
//     misma fila; la regla "1 contrato vigente por vehículo" lo garantiza).
//   - ult_ticket:   último ticket con salida pendiente (puesto actual del diario).
export async function obtenerVehiculosDeCliente(doc: number) {
  const { rows } = await pool.query(
    `SELECT
       v.placa,
       v.color,
       t.tipo_vehiculo AS tipo,
       ult_contrato.contrato_inicio,
       ult_contrato.contrato_fin,
       ult_ticket.puesto
     FROM vehiculos v
     JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
     LEFT JOIN LATERAL (
       SELECT
         TO_CHAR(c.fecha_inicio, 'DD-MM-YYYY') AS contrato_inicio,
         TO_CHAR(c.fecha_fin, 'DD-MM-YYYY') AS contrato_fin
       FROM contratos c
       WHERE c.vehiculos_placa = v.placa
         AND c.fecha_eliminado IS NULL
       ORDER BY c.fecha_inicio DESC
       LIMIT 1
     ) ult_contrato ON true
     LEFT JOIN LATERAL (
       SELECT p.numero_puesto::text AS puesto
       FROM tickets tik
       JOIN puestos p ON p.id_puesto = tik.puestos_id_puesto
       WHERE tik.vehiculos_placa = v.placa
         AND tik.fecha_salida IS NULL
         AND tik.fecha_eliminado IS NULL
       ORDER BY tik.fecha_ingreso DESC
       LIMIT 1
     ) ult_ticket ON true
     WHERE v.usuarios_documento = $1 AND v.fecha_eliminado IS NULL
     ORDER BY v.placa`,
    [doc]
  );

  return rows;
}

// Últimos 10 tickets cerrados del cliente (historial de movimientos con valor).
export async function obtenerHistorialCliente(doc: number) {
  const { rows } = await pool.query(
    `SELECT
       TO_CHAR(tik.fecha_ingreso, 'DD-MM-YYYY HH24:MI') AS fecha,
       tik.valor_total AS valor
     FROM tickets tik
     WHERE tik.usuarios_documento = $1
       AND tik.fecha_eliminado IS NULL
       AND tik.fecha_salida IS NOT NULL
     ORDER BY tik.fecha_ingreso DESC
     LIMIT 10`,
    [doc]
  );

  return rows;
}
