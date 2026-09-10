// Modelo de tickets diarios: alta, cierre con cálculo y finalización.
import pool from "@/lib/db";
import bcrypt from "bcryptjs";
import { registrarLog } from "@/lib/log";
import { ErrorDominio } from "@/lib/models/errores";
import { obtenerTarifaPorTipo } from "./tarifas.model";

interface OpcionesListado {
  pagina?: number;
  tamano?: number;
  buscar?: string;
  orden?: "id" | "placa" | "propietario" | "entrada" | "estado";
  dir?: "asc" | "desc";
}

// Lista tickets con paginación y orden server-side.
export async function listarTickets(opts: OpcionesListado = {}) {
  const pagina = Math.max(1, opts.pagina || 1);
  const tamano = Math.min(100, Math.max(1, opts.tamano || 20));
  const offset = (pagina - 1) * tamano;

  const filtros: string[] = [];
  const params: unknown[] = [];

  if (opts.buscar && opts.buscar.trim()) {
    params.push(`%${opts.buscar.trim()}%`);
    const idx = params.length;
    filtros.push(`(v.placa ILIKE $${idx} OR u.nombre ILIKE $${idx})`);
  }

  const where = filtros.length ? "WHERE " + filtros.join(" AND ") : "";

  const cols: Record<string, string> = {
    id: "tik.id_ticket",
    placa: "v.placa",
    propietario: "u.nombre",
    entrada: "tik.fecha_ingreso",
    estado: "estado",
  };
  const col = cols[opts.orden || "entrada"] || "tik.fecha_ingreso";
  const dir = opts.dir === "asc" ? "ASC" : "DESC";

  const total = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM tickets tik
     JOIN vehiculos v ON v.placa = tik.vehiculos_placa
     JOIN usuarios u ON u.documento = tik.usuarios_documento
     ${where}`,
    params
  );

  const { rows } = await pool.query(
    `SELECT
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
        WHEN tik.fecha_eliminado IS NOT NULL THEN 'finalizado'
        WHEN tik.fecha_salida IS NULL THEN 'activo'
        ELSE 'cerrado'
      END AS estado
    FROM tickets tik
    JOIN vehiculos v ON v.placa = tik.vehiculos_placa
    JOIN usuarios u ON u.documento = tik.usuarios_documento
    ${where}
    ORDER BY ${col} ${dir}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, tamano, offset]
  );

  return {
    datos: rows,
    total: total.rows[0].total,
    pagina,
    tamano,
    totalPaginas: Math.max(1, Math.ceil(total.rows[0].total / tamano)),
  };
}

// Crear ticket diario. Reglas:
//   1. Puesto debe existir y estar libre.
//   2. Si el vehículo ya existe y es mensual → error.
//   3. Si el vehículo no existe: crear vehículo diario y (si aplica) cliente nuevo.
//   4. No puede haber dos tickets abiertos para la misma placa.
//   5. Se ocupa el puesto, reutilizando el del último ticket si sigue libre.
//   6. Se registra log con el operador actual.
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

  // 1. Validación del puesto.
  const puesto = await pool.query(
    `SELECT id_puesto, estado_puesto
     FROM puestos
     WHERE id_puesto = $1 AND fecha_eliminado IS NULL`,
    [Number(puestos_id_puesto)]
  );

  if (!puesto.rows.length || puesto.rows[0].estado_puesto) {
    throw new ErrorDominio("El puesto no existe o está ocupado");
  }

  // 2. ¿Existe el vehículo?
  const vehiculo = await pool.query(
    `SELECT v.usuarios_documento, t.tipo_vehiculo AS tipo
     FROM vehiculos v
     JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
     WHERE v.placa = $1 AND v.fecha_eliminado IS NULL
     LIMIT 1`,
    [placaLimpia]
  );

  // 3. Si el vehículo ya existía, reutiliza el puesto de su último ticket siempre que esté libre.
  let puestoFinal = Number(puestos_id_puesto);

  if (vehiculo.rows.length) {
    const ultimo = await pool.query(
      `SELECT puestos_id_puesto
       FROM tickets
       WHERE vehiculos_placa = $1
         AND puestos_id_puesto IS NOT NULL
       ORDER BY fecha_ingreso DESC
       LIMIT 1`,
      [placaLimpia]
    );

    if (ultimo.rows.length) {
      const puestoAnterior = Number(ultimo.rows[0].puestos_id_puesto);
      const libre = await pool.query(
        `SELECT 1 FROM puestos
         WHERE id_puesto = $1 AND estado_puesto = FALSE AND fecha_eliminado IS NULL`,
        [puestoAnterior]
      );
      if (libre.rows.length) {
        puestoFinal = puestoAnterior;
      }
    }
  }

  let propietarioDoc: number;

  if (vehiculo.rows.length) {
    // Ya existe: debe ser diario.
    if (vehiculo.rows[0].tipo === "mensual") {
      throw new ErrorDominio("Los vehículos mensuales no usan tickets");
    }
    propietarioDoc = Number(vehiculo.rows[0].usuarios_documento);

    // Reactiva el vehículo por si fue marcado inactivo al finalizar su último ticket.
    await pool.query(
      `UPDATE vehiculos
       SET estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'activo')
       WHERE placa = $1`,
      [placaLimpia]
    );
  } else {
    // No existe: hace falta documento del propietario.
    if (!doc_propietario) {
      throw new ErrorDominio("Ingrese documento del propietario para el vehículo diario");
    }

    const docFinal = Number(doc_propietario);

    // ¿Ya está registrado?
    const usuarioExistente = await pool.query(
      `SELECT u.documento, r.nombre_rol AS role
       FROM usuarios u
       JOIN roles r ON r.id_roles = u.roles_id_roles
       JOIN estados e ON e.id_estado = u.estados_id_estado
       WHERE u.documento = $1 AND u.fecha_eliminado IS NULL AND e.nombre_estado <> 'inactivo'`,
      [docFinal]
    );

    if (usuarioExistente.rows.length) {
      // Existe: debe ser cliente.
      const existingRole = usuarioExistente.rows[0].role;
      if (existingRole !== "cliente") {
        throw new ErrorDominio("El propietario debe tener rol cliente");
      }
    } else {
      // No existe: crear cliente con teléfono obligatorio.
      if (!telefono) {
        throw new ErrorDominio("Ingrese teléfono del propietario para el vehículo diario");
      }

      const hash = await bcrypt.hash(String(docFinal), 10);

      await pool.query(
        `INSERT INTO usuarios (
           documento, estados_id_estado, roles_id_roles,
           nombre, telefono, correo, contraseña, cargo
         )
         SELECT $1, e.id_estado, r.id_roles, $2, $3, $4, $5, NULL
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

    // Alta del vehículo diario. ON CONFLICT para no romper si ya existiera.
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

  // 4. No puede haber dos tickets abiertos de la misma placa.
  const ticketAbierto = await pool.query(
    `SELECT 1 FROM tickets
     WHERE vehiculos_placa = $1 AND fecha_salida IS NULL AND fecha_eliminado IS NULL
     LIMIT 1`,
    [placaLimpia]
  );

  if (ticketAbierto.rows.length) {
    throw new ErrorDominio("El vehículo ya tiene un ticket abierto", 409);
  }

  // 5. Tarifa diaria y estado activo.
  const tarifaDiaria = await obtenerTarifaPorTipo("diario");
  const estadoActivo = await pool.query(
    `SELECT id_estado FROM estados WHERE nombre_estado = 'activo' LIMIT 1`
  );

  if (!estadoActivo.rows.length) {
    throw new ErrorDominio("Falta estado activo", 500);
  }

  // 6. Insertar el ticket. valor_total se llena al cerrar.
  const { rows } = await pool.query(
    `INSERT INTO tickets (
       usuarios_documento, puestos_id_puesto, tarifa_id_tarifa,
       vehiculos_placa, estados_id_estado, fecha_ingreso,
       valor_total
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), 0)
     RETURNING id_ticket::text AS id`,
    [
      propietarioDoc,
      puestoFinal,
      tarifaDiaria.id_tarifa,
      placaLimpia,
      estadoActivo.rows[0].id_estado,
    ]
  );

  // 7. Ocupar el puesto.
  await pool.query(
    `UPDATE puestos SET estado_puesto = TRUE WHERE id_puesto = $1`,
    [puestoFinal]
  );

  await registrarLog(operadorDoc, `Registró ticket para ${placaLimpia}`);

  return { ok: true, id: rows[0].id };
}

// Cerrar ticket. Calcula valor_total:
//   - Si hay valor_hora > 0, cobra por horas completas (mínimo 1).
//   - Si hay valor_dia, se topa al valor diario.
//   - Si no hay valor_hora, cobra directo el valor_dia.
// Libera el puesto y registra log.
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
         valor_total = $1
     WHERE id_ticket = $2`,
    [valorTotal, Number(id)]
  );

  // Liberar puesto.
  await pool.query(
    `UPDATE puestos SET estado_puesto = FALSE WHERE id_puesto = $1`,
    [tk.puestos_id_puesto]
  );

  await registrarLog(operadorDoc, `Cerró ticket ${tk.vehiculos_placa} por $${valorTotal}`);

  return { ok: true, valorTotal };
}

// Finaliza un ticket: lo marca como finalizado en el historial, marca el
// vehículo asociado como inactivo, y libera el puesto ocupado.
export async function finalizarTicket(id: string, operadorDoc: string) {
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

  // Marca el ticket como finalizado (soft delete) en el historial.
  await pool.query(
    `UPDATE tickets
     SET fecha_eliminado = NOW(),
         fecha_salida = NOW(),
         estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo')
     WHERE id_ticket = $1`,
    [Number(id)]
  );

  // Marca el vehículo como inactivo hasta que se cree un nuevo ticket con su misma placa.
  await pool.query(
    `UPDATE vehiculos
     SET estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo')
     WHERE placa = $1`,
    [vehiculos_placa]
  );

  // Libera el puesto para que pueda asignarse a otro vehículo.
  await pool.query(
    `UPDATE puestos SET estado_puesto = FALSE WHERE id_puesto = $1`,
    [puestos_id_puesto]
  );

  await registrarLog(operadorDoc, `Finalizó ticket ${vehiculos_placa}`);

  return { ok: true };
}

// Datos del ticket para imprimir el comprobante tras crear.
// Devuelve todo lo que debe aparecer en el papel: placa, propietario, puesto, ingreso y tarifa.
export async function obtenerTicketParaImpresion(id: string) {
  const { rows } = await pool.query(
    `SELECT
       tik.id_ticket::text AS id,
       v.placa,
       u.nombre AS propietario,
       u.documento,
       u.telefono,
       p.numero_puesto,
       TO_CHAR(tik.fecha_ingreso, 'YYYY-MM-DD HH24:MI') AS entrada,
       tar.tipo_vehiculo AS modalidad,
       tar.valor_hora,
       tar.valor_dia,
       tar.valor_mes
     FROM tickets tik
     JOIN vehiculos v ON v.placa = tik.vehiculos_placa
     JOIN usuarios u ON u.documento = tik.usuarios_documento
     JOIN puestos p ON p.id_puesto = tik.puestos_id_puesto
     JOIN tarifa tar ON tar.id_tarifa = tik.tarifa_id_tarifa
     WHERE tik.id_ticket = $1`,
    [Number(id)]
  );

  return rows[0] || null;
}
