import pool from "@/lib/db";
import { ErrorDominio } from "./errores";
import { crearClienteSiNoExiste } from "./usuarios.model";

export async function listarVehiculos() {
  const { rows } = await pool.query(`
    SELECT
      v.placa,
      u.documento::text AS doc,
      u.nombre,
      u.telefono,
      u.correo,
      t.tipo_vehiculo AS tipo,
      e.nombre_estado AS estado,
      v.color,
      COALESCE(
        CASE
          WHEN t.tipo_vehiculo = 'mensual' THEN (
            SELECT TO_CHAR(MAX(c.fecha_inicio), 'YYYY-MM-DD HH24:MI')
            FROM contratos c
            WHERE c.vehiculos_placa = v.placa AND c.fecha_eliminado IS NULL
          )
          ELSE (
            SELECT TO_CHAR(MAX(tik.fecha_ingreso), 'YYYY-MM-DD HH24:MI')
            FROM tickets tik
            WHERE tik.vehiculos_placa = v.placa AND tik.fecha_eliminado IS NULL
          )
        END, '—'
      ) AS ingreso,
      COALESCE(
        CASE
          WHEN t.tipo_vehiculo = 'mensual' THEN (
            SELECT TO_CHAR(MAX(c.fecha_fin), 'YYYY-MM-DD HH24:MI')
            FROM contratos c
            WHERE c.vehiculos_placa = v.placa AND c.fecha_eliminado IS NULL
          )
          ELSE (
            SELECT TO_CHAR(MAX(tik.fecha_salida), 'YYYY-MM-DD HH24:MI')
            FROM tickets tik
            WHERE tik.vehiculos_placa = v.placa AND tik.fecha_eliminado IS NULL
          )
        END, '—'
      ) AS salida,
      CASE
        WHEN t.tipo_vehiculo = 'mensual' THEN 'Contrato'
        ELSE COALESCE((
          SELECT p.numero_puesto::text
          FROM tickets tik
          JOIN puestos p ON p.id_puesto = tik.puestos_id_puesto
          WHERE tik.vehiculos_placa = v.placa
            AND tik.fecha_salida IS NULL
            AND tik.fecha_eliminado IS NULL
          ORDER BY tik.fecha_ingreso DESC
          LIMIT 1
        ), '—')
      END AS puesto
    FROM vehiculos v
    JOIN usuarios u ON u.documento = v.usuarios_documento
    JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
    JOIN estados e ON e.id_estado = v.estados_id_estado
    WHERE v.fecha_eliminado IS NULL
    ORDER BY v.placa
  `);

  return rows;
}

export async function registrarVehiculoMensual(datos: {
  placa?: string;
  doc?: string | number;
  nombre?: string;
  telefono?: string;
  color?: string;
}) {
  const { placa, doc, nombre, telefono, color = "No especificado" } = datos;
  const placaLimpia = String(placa || "").toUpperCase().trim();

  if (!placaLimpia || !doc) {
    throw new ErrorDominio("La placa y el documento son obligatorios", 400);
  }

  const duplicado = await pool.query(
    `SELECT 1 FROM vehiculos
     WHERE placa = $1 AND fecha_eliminado IS NULL
     LIMIT 1`,
    [placaLimpia]
  );

  if (duplicado.rows.length) {
    throw new ErrorDominio("La placa ya está registrada", 409);
  }

  const cliente = await crearClienteSiNoExiste({
    doc: Number(doc),
    nombre,
    telefono,
  });

  const tarifa = await pool.query(
    `SELECT id_tarifa
     FROM tarifa
     WHERE tipo_vehiculo = 'mensual' AND fecha_eliminado IS NULL
     LIMIT 1`
  );

  const estado = await pool.query(
    `SELECT id_estado
     FROM estados
     WHERE nombre_estado = 'activo'
     LIMIT 1`
  );

  if (!tarifa.rows.length || !estado.rows.length) {
    throw new ErrorDominio("Faltan tarifas o estados configurados", 500);
  }

  const tarifaId = tarifa.rows[0].id_tarifa;
  const estadoId = estado.rows[0].id_estado;
  const docFinal = Number(doc);

  await pool.query(
    `INSERT INTO vehiculos (placa, usuarios_documento, estados_id_estado, tarifa_id_tarifa, color)
     VALUES ($1, $2, $3, $4, $5)`,
    [placaLimpia, docFinal, estadoId, tarifaId, color]
  );

  await pool.query(
    `INSERT INTO contratos (
       tarifa_id_tarifa, vehiculos_placa, usuarios_documento,
       estados_id_estado, fecha_inicio, fecha_fin, estado_pago
     )
     VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '1 month', FALSE)`,
    [tarifaId, placaLimpia, docFinal, estadoId]
  );

  return {
    ok: true,
    placa: placaLimpia,
    clienteCreado: cliente.creado,
  };
}

export async function actualizarEstadoVehiculo(placa: string, nombreEstado: string) {
  const { rows } = await pool.query(
    `SELECT id_estado FROM estados WHERE nombre_estado = $1 LIMIT 1`,
    [nombreEstado]
  );

  if (!rows.length) {
    throw new ErrorDominio(`Estado ${nombreEstado} no existe`, 400);
  }

  await pool.query(
    `UPDATE vehiculos
     SET estados_id_estado = $1
     WHERE placa = $2 AND fecha_eliminado IS NULL`,
    [rows[0].id_estado, placa]
  );

  return { ok: true };
}

export async function actualizarColorVehiculo(placa: string, color: string) {
  await pool.query(
    `UPDATE vehiculos SET color = $1 WHERE placa = $2 AND fecha_eliminado IS NULL`,
    [color, placa]
  );
}

export async function eliminarVehiculoSoft(placa: string) {
  await pool.query(
    `UPDATE vehiculos SET fecha_eliminado = NOW()
     WHERE placa = $1 AND fecha_eliminado IS NULL`,
    [placa]
  );

  return { ok: true };
}
