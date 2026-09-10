// Modelo de vehículos. Dos flujos:
//   - Mensual: alta desde este modelo, genera contrato.
//   - Diario: alta desde tickets.model cuando se crea el ticket.
import pool from "@/lib/db";
import { ErrorDominio } from "./errores";
import { crearClienteSiNoExiste } from "./usuarios.model";

interface OpcionesListado {
  pagina?: number;
  tamano?: number;
  buscar?: string;
  orden?: "placa" | "nombre" | "tipo" | "estado" | "ingreso";
  dir?: "asc" | "desc";
  filtro?: string;
}

// Lista vehículos activos con paginación y orden server-side.
// Filtros soportados por `filtro`: "todos" | "mensual" | "diario" | "activo" | "inactivo".
export async function listarVehiculos(opts: OpcionesListado = {}) {
  const pagina = Math.max(1, opts.pagina || 1);
  const tamano = Math.min(100, Math.max(1, opts.tamano || 20));
  const offset = (pagina - 1) * tamano;

  const filtros: string[] = ["v.fecha_eliminado IS NULL"];
  const params: unknown[] = [];

  if (opts.buscar && opts.buscar.trim()) {
    params.push(`%${opts.buscar.trim()}%`);
    const idx = params.length;
    filtros.push(`(v.placa ILIKE $${idx} OR u.nombre ILIKE $${idx})`);
  }

  const filtro = opts.filtro || "todos";

  if (filtro === "todos") {
    // Solo se muestran vehículos vigentes:
    //   - Mensuales: estado almacenado "activo".
    //   - Diarios: existencia de ticket abierto.
    // Los mensuales inactivos viven en la papelera.
    filtros.push(`(
      (t.tipo_vehiculo = 'mensual' AND e.nombre_estado = 'activo')
      OR
      (t.tipo_vehiculo <> 'mensual' AND EXISTS (
        SELECT 1 FROM tickets tik
        WHERE tik.vehiculos_placa = v.placa
          AND tik.fecha_salida IS NULL
          AND tik.fecha_eliminado IS NULL
      ))
    )`);
  } else if (filtro === "mensual" || filtro === "diario") {
    params.push(filtro);
    filtros.push(`t.tipo_vehiculo = $${params.length}`);
  } else if (filtro === "activo") {
    // Para mensuales: estado almacenado. Para diarios: existencia de ticket abierto.
    filtros.push(`(
      (t.tipo_vehiculo = 'mensual' AND e.nombre_estado = 'activo')
      OR
      (t.tipo_vehiculo <> 'mensual' AND EXISTS (
        SELECT 1 FROM tickets tik
        WHERE tik.vehiculos_placa = v.placa
          AND tik.fecha_salida IS NULL
          AND tik.fecha_eliminado IS NULL
      ))
    )`);
  } else if (filtro === "inactivo") {
    filtros.push(`(
      (t.tipo_vehiculo = 'mensual' AND e.nombre_estado <> 'activo')
      OR
      (t.tipo_vehiculo <> 'mensual' AND NOT EXISTS (
        SELECT 1 FROM tickets tik
        WHERE tik.vehiculos_placa = v.placa
          AND tik.fecha_salida IS NULL
          AND tik.fecha_eliminado IS NULL
      ))
    )`);
  }

  const where = "WHERE " + filtros.join(" AND ");

  const cols: Record<string, string> = {
    placa: "v.placa",
    nombre: "u.nombre",
    tipo: "t.tipo_vehiculo",
    estado: "e.nombre_estado",
    ingreso: "ingreso",
  };
  const col = cols[opts.orden || "placa"] || "v.placa";
  const dir = opts.dir === "desc" ? "DESC" : "ASC";

  const total = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM vehiculos v
     JOIN usuarios u ON u.documento = v.usuarios_documento
     JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
     JOIN estados e ON e.id_estado = v.estados_id_estado
     ${where}`,
    params
  );

  const { rows } = await pool.query(
    `SELECT
      v.placa,
      u.documento::text AS doc,
      u.nombre,
      u.telefono,
      u.correo,
      t.tipo_vehiculo AS tipo,
      CASE
        WHEN t.tipo_vehiculo = 'mensual' THEN e.nombre_estado
        ELSE CASE
          WHEN EXISTS (
            SELECT 1 FROM tickets tik
            WHERE tik.vehiculos_placa = v.placa
              AND tik.fecha_salida IS NULL
              AND tik.fecha_eliminado IS NULL
          ) THEN 'activo'
          ELSE 'inactivo'
        END
      END AS estado,
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
        WHEN t.tipo_vehiculo = 'mensual' THEN COALESCE((
          SELECT p.numero_puesto::text
          FROM contratos c
          JOIN puestos p ON p.id_puesto = c.puestos_id_puesto
          WHERE c.vehiculos_placa = v.placa
            AND c.fecha_eliminado IS NULL
            AND c.fecha_fin > NOW()
          ORDER BY c.fecha_inicio DESC
          LIMIT 1
        ), '—')
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

// Consulta puntual usada por el modal de tickets para saber si existe la placa
// y reutilizar su último puesto. Antes vivía como SQL directo en el controlador.
export async function obtenerVehiculoPorPlaca(placa: string) {
  const placaLimpia = String(placa || "").toUpperCase().trim();

  const [vehiculo, ultimo] = await Promise.all([
    pool.query(
      `SELECT v.placa, v.estados_id_estado, t.tipo_vehiculo AS tipo, u.nombre, u.documento
       FROM vehiculos v
       JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
       JOIN usuarios u ON u.documento = v.usuarios_documento
       WHERE v.placa = $1 AND v.fecha_eliminado IS NULL
       LIMIT 1`,
      [placaLimpia]
    ),
    pool.query(
      `SELECT tik.puestos_id_puesto, p.numero_puesto, p.estado_puesto
       FROM tickets tik
       JOIN puestos p ON p.id_puesto = tik.puestos_id_puesto
       WHERE tik.vehiculos_placa = $1
       ORDER BY tik.fecha_ingreso DESC
       LIMIT 1`,
      [placaLimpia]
    ),
  ]);

  return {
    existe: vehiculo.rows.length > 0,
    vehiculo: vehiculo.rows[0] || null,
    ultimoPuesto: ultimo.rows[0] || null,
  };
}

// Alta de vehículo mensual. Reglas:
//   1. Placa no puede duplicarse mientras esté activa.
//   2. Si el propietario no existe, se crea como cliente.
//   3. Se asocia la tarifa mensual vigente y un puesto libre obligatorio.
//   4. Se genera un contrato de 1 mes desde NOW() y se ocupa el puesto.
export async function registrarVehiculoMensual(datos: {
  placa?: string;
  doc?: string | number;
  nombre?: string;
  telefono?: string;
  color?: string;
  puestosIdPuesto?: number | string;
}) {
  const { placa, doc, nombre, telefono, color = "No especificado", puestosIdPuesto } = datos;
  const placaLimpia = String(placa || "").toUpperCase().trim();
  const puestoId = Number(puestosIdPuesto);

  if (!placaLimpia || !doc) {
    throw new ErrorDominio("La placa y el documento son obligatorios", 400);
  }

  if (!puestoId || Number.isNaN(puestoId) || puestoId <= 0) {
    throw new ErrorDominio("Debe asignar un puesto al contrato", 400);
  }

  const puesto = await pool.query(
    `SELECT id_puesto, estado_puesto
     FROM puestos
     WHERE id_puesto = $1 AND fecha_eliminado IS NULL`,
    [puestoId]
  );

  if (!puesto.rows.length) {
    throw new ErrorDominio("El puesto no existe", 404);
  }

  if (puesto.rows[0].estado_puesto) {
    throw new ErrorDominio("El puesto ya está ocupado", 409);
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
       estados_id_estado, fecha_inicio, fecha_fin,
       puestos_id_puesto
     )
     VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '1 month', $5)`,
    [tarifaId, placaLimpia, docFinal, estadoId, puestoId]
  );

  await pool.query(
    `UPDATE puestos SET estado_puesto = TRUE WHERE id_puesto = $1`,
    [puestoId]
  );

  return {
    ok: true,
    placa: placaLimpia,
    clienteCreado: cliente.creado,
  };
}

// Actualiza un vehículo: estado, color, nombre del propietario y/o puesto del contrato.
// Todo va en una transacción: si algo falla, no queda un cambio parcial.
// - estado: "activo" | "inactivo".
//   * Al pasar a "inactivo" se liberan los puestos de tickets abiertos,
//     pero NO el puesto del contrato (queda reservado para el cliente).
// - color: cambia el color del vehículo.
// - nombre: cambia el nombre del propietario (vive en usuarios).
// - puestosIdPuesto: (solo mensual) reasigna el puesto del contrato vigente.
export async function actualizarVehiculo(
  placa: string,
  cambios: {
    estado?: string;
    color?: string;
    nombre?: string;
    puestosIdPuesto?: number;
  }
) {
  const { estado, color, nombre, puestosIdPuesto } = cambios;
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    // 1. Cambio de estado.
    if (estado) {
      const estadoRes = await cliente.query(
        `SELECT id_estado FROM estados WHERE nombre_estado = $1 LIMIT 1`,
        [estado]
      );
      if (!estadoRes.rows.length) {
        throw new ErrorDominio(`Estado ${estado} no existe`, 400);
      }

      await cliente.query(
        `UPDATE vehiculos SET estados_id_estado = $1
         WHERE placa = $2 AND fecha_eliminado IS NULL`,
        [estadoRes.rows[0].id_estado, placa]
      );

      if (estado === "inactivo") {
        // Libera puestos ocupados por tickets abiertos. El del contrato se mantiene.
        await cliente.query(
          `UPDATE puestos p SET estado_puesto = FALSE
           FROM tickets tik
           WHERE tik.vehiculos_placa = $1
             AND tik.puestos_id_puesto = p.id_puesto
             AND tik.fecha_salida IS NULL
             AND tik.fecha_eliminado IS NULL`,
          [placa]
        );
      }
    }

    // 2. Cambio de color.
    if (color) {
      await cliente.query(
        `UPDATE vehiculos SET color = $1
         WHERE placa = $2 AND fecha_eliminado IS NULL`,
        [color, placa]
      );
    }

    // 3. Cambio de nombre del propietario (vive en usuarios).
    if (nombre !== undefined && nombre.trim()) {
      await cliente.query(
        `UPDATE usuarios u SET nombre = $1
         FROM vehiculos v
         WHERE v.usuarios_documento = u.documento
           AND v.placa = $2
           AND v.fecha_eliminado IS NULL`,
        [nombre.trim(), placa]
      );
    }

    // 4. Reasignación de puesto del contrato vigente.
    if (puestosIdPuesto && !Number.isNaN(Number(puestosIdPuesto))) {
      const nuevoId = Number(puestosIdPuesto);

      // Contrato vigente.
      const actual = await cliente.query(
        `SELECT id_contrato, puestos_id_puesto
         FROM contratos
         WHERE vehiculos_placa = $1
           AND fecha_eliminado IS NULL
           AND fecha_fin > NOW()
         ORDER BY fecha_inicio DESC
         LIMIT 1`,
        [placa]
      );
      if (!actual.rows.length) {
        throw new ErrorDominio(
          "El vehículo no tiene contrato vigente para reasignar puesto",
          404
        );
      }

      const puestoAnteriorId = actual.rows[0].puestos_id_puesto;

      // Si el nuevo id es el mismo que ya tiene el contrato, no-op.
      // Importante: se verifica ANTES de comprobar estado_puesto, porque ese
      // puesto aparece como ocupado precisamente por este vehículo.
      if (Number(puestoAnteriorId) !== nuevoId) {
        const nuevo = await cliente.query(
          `SELECT id_puesto, estado_puesto
           FROM puestos
           WHERE id_puesto = $1 AND fecha_eliminado IS NULL`,
          [nuevoId]
        );
        if (!nuevo.rows.length) {
          throw new ErrorDominio("El puesto no existe", 404);
        }
        if (nuevo.rows[0].estado_puesto) {
          throw new ErrorDominio("El puesto ya está ocupado", 409);
        }

        await cliente.query(
          `UPDATE contratos SET puestos_id_puesto = $1 WHERE id_contrato = $2`,
          [nuevoId, actual.rows[0].id_contrato]
        );

        if (puestoAnteriorId) {
          await cliente.query(
            `UPDATE puestos SET estado_puesto = FALSE WHERE id_puesto = $1`,
            [puestoAnteriorId]
          );
        }
        await cliente.query(
          `UPDATE puestos SET estado_puesto = TRUE WHERE id_puesto = $1`,
          [nuevoId]
        );
      }
    }

    await cliente.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
}

// Soft delete: se conserva el registro para historial, pero deja de aparecer.
// Libera el puesto del contrato activo y cierra el propio contrato.
export async function eliminarVehiculoSoft(placa: string) {
  await pool.query(
    `UPDATE puestos p
     SET estado_puesto = FALSE
     FROM contratos c
     WHERE c.vehiculos_placa = $1
       AND c.puestos_id_puesto = p.id_puesto
       AND c.fecha_eliminado IS NULL`,
    [placa]
  );

  await pool.query(
    `UPDATE contratos
     SET fecha_eliminado = NOW(),
         estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo')
     WHERE vehiculos_placa = $1 AND fecha_eliminado IS NULL`,
    [placa]
  );

  await pool.query(
    `UPDATE vehiculos SET fecha_eliminado = NOW()
     WHERE placa = $1 AND fecha_eliminado IS NULL`,
    [placa]
  );

  return { ok: true };
}

// Catálogo de tipos de vehículo. Antes vivía como SQL suelto en el controlador
// de /api/vehiculos; se centraliza aquí para mantener MVC estricto.
export async function listarTiposVehiculo() {
  const { rows } = await pool.query(
    `SELECT id_tipo_vehiculo::text AS id, nombre, icono
     FROM tipos_vehiculo
     WHERE fecha_eliminado IS NULL
     ORDER BY id_tipo_vehiculo`
  );

  return rows;
}

// Vehículos mensuales con estado "inactivo" (papelera de reciclaje).
// Siguen teniendo su contrato vigente, pero el vehículo quedó suspendido.
// Se usa para reactivarlos o borrarlos definitivamente.
export async function listarVehiculosInactivos() {
  const { rows } = await pool.query(`
    SELECT
      v.placa,
      u.documento::text AS doc,
      u.nombre,
      u.telefono,
      v.color,
      t.tipo_vehiculo AS tipo,
      COALESCE((
        SELECT p.numero_puesto::text
        FROM contratos c
        JOIN puestos p ON p.id_puesto = c.puestos_id_puesto
        WHERE c.vehiculos_placa = v.placa
          AND c.fecha_eliminado IS NULL
          AND c.fecha_fin > NOW()
        ORDER BY c.fecha_inicio DESC
        LIMIT 1
      ), '—') AS puesto,
      (SELECT TO_CHAR(MAX(c.fecha_fin), 'DD-MM-YYYY')
       FROM contratos c
       WHERE c.vehiculos_placa = v.placa AND c.fecha_eliminado IS NULL) AS contrato_fin
    FROM vehiculos v
    JOIN usuarios u ON u.documento = v.usuarios_documento
    JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
    JOIN estados e ON e.id_estado = v.estados_id_estado
    WHERE v.fecha_eliminado IS NULL
      AND t.tipo_vehiculo = 'mensual'
      AND e.nombre_estado = 'inactivo'
    ORDER BY v.placa
  `);

  return rows;
}
