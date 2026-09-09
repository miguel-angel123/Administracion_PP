import pool from "@/lib/db";
import bcrypt from "bcryptjs";
import { registrarLog } from "@/lib/log";
import { ErrorDominio } from "@/lib/models/errores";
import { obtenerTarifaPorTipo } from "./tarifas.model";

export async function listarTickets() {
  const { rows } = await pool.query(`
    SELECT
      tik.id_ticket::text AS id,
      v.placa,
      u.nombre AS propietario,
      TO_CHAR(tik.fecha_ingreso, 'YYYY-MM-DD HH24:MI') AS entrada,
      COALESCE(TO_CHAR(tik.fecha_salida, 'YYYY-MM-DD HH24:MI'), '—') AS salida,
      CASE
        WHEN tik.fecha_salida IS NULL THEN '—'
        ELSE tik.valor_total::text
      END AS total,
      CASE
        WHEN tik.fecha_eliminado IS NOT NULL THEN 'cancelado'
        WHEN tik.fecha_salida IS NULL THEN 'activo'
        ELSE 'cerrado'
      END AS estado
    FROM tickets tik
    JOIN vehiculos v ON v.placa = tik.vehiculos_placa
    JOIN usuarios u ON u.documento = tik.usuarios_documento
    ORDER BY tik.fecha_ingreso DESC
  `);

  return rows;
}

export async function crearTicket(datos: {
  placa?: string;
  doc_propietario?: string;
  telefono?: string;
  puestos_id_puesto?: number;
  operadorDoc: string;
}) {
  const { placa, doc_propietario, telefono, puestos_id_puesto, operadorDoc } = datos;
  const placaLimpia = String(placa || "").toUpperCase().trim();

  if (!placaLimpia || !puestos_id_puesto) {
    throw new ErrorDominio("Faltan placa o puesto");
  }

  const puesto = await pool.query(
    `SELECT id_puesto, estado_puesto
     FROM puestos
     WHERE id_puesto = $1 AND fecha_eliminado IS NULL`,
    [Number(puestos_id_puesto)]
  );

  if (!puesto.rows.length || puesto.rows[0].estado_puesto) {
    throw new ErrorDominio("El puesto no existe o está ocupado");
  }

  const vehiculo = await pool.query(
    `SELECT v.usuarios_documento, t.tipo_vehiculo AS tipo
     FROM vehiculos v
     JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
     WHERE v.placa = $1 AND v.fecha_eliminado IS NULL
     LIMIT 1`,
    [placaLimpia]
  );

  let propietarioDoc: number;

  if (vehiculo.rows.length) {
    if (vehiculo.rows[0].tipo === "mensual") {
      throw new ErrorDominio("Los vehículos mensuales no usan tickets");
    }
    propietarioDoc = Number(vehiculo.rows[0].usuarios_documento);
  } else {
    if (!doc_propietario) {
      throw new ErrorDominio("Ingrese documento del propietario para el vehículo diario");
    }

    const docFinal = Number(doc_propietario);

    const usuarioExistente = await pool.query(
      `SELECT u.documento, r.nombre_rol AS role
       FROM usuarios u
       JOIN roles r ON r.id_roles = u.roles_id_roles
       JOIN estados e ON e.id_estado = u.estados_id_estado
       WHERE u.documento = $1 AND u.fecha_eliminado IS NULL AND e.nombre_estado <> 'inactivo'`,
      [docFinal]
    );

    if (usuarioExistente.rows.length) {
      const existingRole = usuarioExistente.rows[0].role;
      if (existingRole !== "cliente") {
        throw new ErrorDominio("El propietario debe tener rol cliente");
      }
    } else {
      if (!telefono) {
        throw new ErrorDominio("Ingrese teléfono del propietario para el vehículo diario");
      }

      const hash = await bcrypt.hash(String(docFinal), 10);

      await pool.query(
        `INSERT INTO usuarios (
           documento, estados_id_estado, roles_id_roles,
           nombre, fecha_nacimiento, telefono, correo,
           genero, contraseña, cargo
         )
         SELECT $1, e.id_estado, r.id_roles, $2, '2000-01-01', $3, $4, 'otro', $5, NULL
         FROM estados e, roles r
         WHERE e.nombre_estado = 'activo' AND r.nombre_rol = 'cliente'`,
        [
          docFinal,
          `Visitante ${docFinal}`,
          String(telefono),
          `${docFinal}@parqueadero.generado`,
          hash,
        ]
      );

      await registrarLog(operadorDoc, `Creó cliente ${docFinal} por ticket`);
    }

    await pool.query(
      `INSERT INTO vehiculos (placa, usuarios_documento, estados_id_estado, tarifa_id_tarifa, color)
       SELECT $1, $2, e.id_estado, t.id_tarifa, 'No especificado'
       FROM estados e, tarifa t
       WHERE e.nombre_estado = 'activo' AND t.tipo_vehiculo = 'diario'
       ON CONFLICT (placa) DO NOTHING`,
      [placaLimpia, docFinal]
    );

    propietarioDoc = docFinal;
  }

  const ticketAbierto = await pool.query(
    `SELECT 1 FROM tickets
     WHERE vehiculos_placa = $1 AND fecha_salida IS NULL AND fecha_eliminado IS NULL
     LIMIT 1`,
    [placaLimpia]
  );

  if (ticketAbierto.rows.length) {
    throw new ErrorDominio("El vehículo ya tiene un ticket abierto", 409);
  }

  const tarifaDiaria = await obtenerTarifaPorTipo("diario");
  const estadoActivo = await pool.query(
    `SELECT id_estado FROM estados WHERE nombre_estado = 'activo' LIMIT 1`
  );

  if (!estadoActivo.rows.length) {
    throw new ErrorDominio("Falta estado activo", 500);
  }

  const { rows } = await pool.query(
    `INSERT INTO tickets (
       usuarios_documento, puestos_id_puesto, tarifa_id_tarifa,
       vehiculos_placa, estados_id_estado, fecha_ingreso,
       valor_total, estado_pago
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), 0, FALSE)
     RETURNING id_ticket::text AS id`,
    [
      propietarioDoc,
      Number(puestos_id_puesto),
      tarifaDiaria.id_tarifa,
      placaLimpia,
      estadoActivo.rows[0].id_estado,
    ]
  );

  await pool.query(
    `UPDATE puestos SET estado_puesto = TRUE WHERE id_puesto = $1`,
    [Number(puestos_id_puesto)]
  );

  await registrarLog(operadorDoc, `Registró ticket para ${placaLimpia}`);

  return { ok: true, id: rows[0].id };
}

export async function cerrarTicket(id: string, operadorDoc: string) {
  const ticket = await pool.query(
    `SELECT
       tik.id_ticket,
       tik.puestos_id_puesto,
       tik.vehiculos_placa,
       tar.valor_dia,
       tar.valor_hora,
       EXTRACT(EPOCH FROM (NOW() - tik.fecha_ingreso)) / 3600 AS horas
     FROM tickets tik
     JOIN tarifa tar ON tar.id_tarifa = tik.tarifa_id_tarifa
     WHERE tik.id_ticket = $1
       AND tik.fecha_salida IS NULL
       AND tik.fecha_eliminado IS NULL`,
    [Number(id)]
  );

  if (!ticket.rows.length) {
    throw new ErrorDominio("Ticket no encontrado o ya cerrado", 404);
  }

  const tk = ticket.rows[0];
  const horas = Number(tk.horas || 0);
  const capDia = Number(tk.valor_dia || 0);
  const valorHora = Number(tk.valor_hora || 0);

  let valorTotal = capDia;
  if (valorHora > 0) {
    const horasCobrables = Math.max(1, Math.ceil(horas));
    valorTotal = horasCobrables * valorHora;
    if (capDia > 0) valorTotal = Math.min(valorTotal, capDia);
  }

  await pool.query(
    `UPDATE tickets
     SET fecha_salida = NOW(),
         valor_total = $1,
         estado_pago = TRUE
     WHERE id_ticket = $2`,
    [valorTotal, Number(id)]
  );

  await pool.query(
    `UPDATE puestos SET estado_puesto = FALSE WHERE id_puesto = $1`,
    [tk.puestos_id_puesto]
  );

  await registrarLog(operadorDoc, `Cerró ticket ${tk.vehiculos_placa} por $${valorTotal}`);

  return { ok: true, valorTotal };
}

export async function cancelarTicket(id: string, operadorDoc: string) {
  const ticket = await pool.query(
    `SELECT puestos_id_puesto, vehiculos_placa
     FROM tickets
     WHERE id_ticket = $1
       AND fecha_eliminado IS NULL`,
    [Number(id)]
  );

  if (!ticket.rows.length) {
    throw new ErrorDominio("Ticket no encontrado", 404);
  }

  const { puestos_id_puesto, vehiculos_placa } = ticket.rows[0];

  await pool.query(
    `UPDATE tickets
     SET fecha_eliminado = NOW(),
         fecha_salida = NOW(),
         estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo')
     WHERE id_ticket = $1`,
    [Number(id)]
  );

  await pool.query(
    `UPDATE puestos SET estado_puesto = FALSE WHERE id_puesto = $1`,
    [puestos_id_puesto]
  );

  await registrarLog(operadorDoc, `Canceló ticket ${vehiculos_placa}`);

  return { ok: true };
}
