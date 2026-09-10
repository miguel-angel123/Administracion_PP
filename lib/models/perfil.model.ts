// Modelo de perfil. Devuelve datos del cliente que consulta: vehículos e historial.
import pool from "@/lib/db";

// Vehículos del cliente. Cada fila incluye:
//   - contrato_inicio/fin si es mensual
//   - puesto actual si es diario y tiene ticket abierto
export async function obtenerVehiculosDeCliente(doc: number) {
  const { rows } = await pool.query(
    `SELECT
       v.placa,
       v.color,
       t.tipo_vehiculo AS tipo,
       (SELECT TO_CHAR(MAX(c.fecha_inicio), 'DD-MM-YYYY')
        FROM contratos c
        WHERE c.vehiculos_placa = v.placa AND c.fecha_eliminado IS NULL) AS contrato_inicio,
       (SELECT TO_CHAR(MAX(c.fecha_fin), 'DD-MM-YYYY')
        FROM contratos c
        WHERE c.vehiculos_placa = v.placa AND c.fecha_eliminado IS NULL) AS contrato_fin,
       (SELECT p.numero_puesto::text
        FROM tickets tik
        JOIN puestos p ON p.id_puesto = tik.puestos_id_puesto
        WHERE tik.vehiculos_placa = v.placa
          AND tik.fecha_salida IS NULL
          AND tik.fecha_eliminado IS NULL
        ORDER BY tik.fecha_ingreso DESC
        LIMIT 1) AS puesto
     FROM vehiculos v
     JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
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
       TO_CHAR(tik.fecha_ingreso, 'YYYY-MM-DD HH24:MI') AS fecha,
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
