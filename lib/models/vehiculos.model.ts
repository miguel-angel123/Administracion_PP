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
//
// Los predicados de modalidad y estado leen `vehiculos` directo: "activo" es la
// columna `estados_id_estado`, mantenida al alza por crearTicket y a la baja
// por cerrarTicket/finalizarTicket. Antes la lectura reconstruía la realidad
// con EXISTS de tickets abiertos y subqueries a tarifa, gastando un EXISTS por
// fila y un CASE anidado para derivar el estado.
export async function listarVehiculos(opts: OpcionesListado = {}) {
  const pagina = Math.max(1, opts.pagina || 1);
  const tamano = Math.min(100, Math.max(1, opts.tamano || 20));
  const offset = (pagina - 1) * tamano;
  const filtro = opts.filtro || "todos";
  const hayBuscar = !!(opts.buscar && opts.buscar.trim());

  const filtros: string[] = ["v.fecha_eliminado IS NULL"];
  const params: unknown[] = [];

  if (hayBuscar) {
    params.push(`%${opts.buscar!.trim()}%`);
    const idx = params.length;
    filtros.push(`(v.placa ILIKE $${idx} OR u.nombre ILIKE $${idx})`);
  }

  const estaActivo = `v.estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'activo')`;
  const estaInactivo = `v.estados_id_estado <> (SELECT id_estado FROM estados WHERE nombre_estado = 'activo')`;

  if (filtro === "todos" || filtro === "activo") {
    filtros.push(estaActivo);
  } else if (filtro === "inactivo") {
    filtros.push(estaInactivo);
  } else if (filtro === "mensual" || filtro === "diario") {
    params.push(filtro);
    filtros.push(
      `v.tarifa_id_tarifa IN (SELECT id_tarifa FROM tarifa WHERE tipo_vehiculo = $${params.length})`
    );
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

  // El COUNT sólo necesita `vehiculos` (y `usuarios` si hay búsqueda por
  // nombre). El filtro de estado ya no exige joins: es una columna de vehiculos.
  const joinUsuariosCount = hayBuscar
    ? `JOIN usuarios u ON u.documento = v.usuarios_documento`
    : "";

  // El estado sale directo de `e.nombre_estado`. El LATERAL de ult_contrato
  // sigue trayendo ingreso/fin/puesto (para mensual) y el de ult_ticket
  // ingreso/salida/puesto del parqueo actual (para diario): son datos que
  // ninguna columna de vehiculos guarda.
  const [total, { rows }] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM vehiculos v
       ${joinUsuariosCount}
       ${where}`,
      params
    ),
    pool.query(
      `SELECT
         v.placa,
         u.documento::text AS doc,
         u.nombre,
         u.telefono,
         u.correo,
         t.tipo_vehiculo AS tipo,
         e.nombre_estado AS estado,
         v.color,
         COALESCE(
           CASE WHEN t.tipo_vehiculo = 'mensual'
             THEN TO_CHAR(ult_contrato.fecha_inicio, 'DD-MM-YYYY HH24:MI')
             ELSE TO_CHAR(ult_ticket.fecha_ingreso, 'DD-MM-YYYY HH24:MI')
           END, '—') AS ingreso,
         COALESCE(
           CASE WHEN t.tipo_vehiculo = 'mensual'
             THEN TO_CHAR(ult_contrato.fecha_fin, 'DD-MM-YYYY HH24:MI')
             ELSE TO_CHAR(ult_ticket.fecha_salida, 'DD-MM-YYYY HH24:MI')
           END, '—') AS salida,
         COALESCE(
           CASE WHEN t.tipo_vehiculo = 'mensual'
             THEN ult_contrato.numero_puesto::text
             ELSE ult_ticket.numero_puesto::text
           END, '—') AS puesto
       FROM vehiculos v
       JOIN usuarios u ON u.documento = v.usuarios_documento
       JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
       JOIN estados e ON e.id_estado = v.estados_id_estado
       LEFT JOIN LATERAL (
         SELECT c.fecha_inicio, c.fecha_fin, p.numero_puesto
         FROM contratos c
         LEFT JOIN puestos p ON p.id_puesto = c.puestos_id_puesto
         WHERE c.vehiculos_placa = v.placa
           AND c.fecha_eliminado IS NULL
         ORDER BY c.fecha_inicio DESC
         LIMIT 1
       ) ult_contrato ON t.tipo_vehiculo = 'mensual'
       LEFT JOIN LATERAL (
         SELECT tik.id_ticket AS id, tik.fecha_ingreso, tik.fecha_salida, p.numero_puesto
         FROM tickets tik
         LEFT JOIN puestos p ON p.id_puesto = tik.puestos_id_puesto
         WHERE tik.vehiculos_placa = v.placa
           AND tik.fecha_eliminado IS NULL
           AND tik.fecha_salida IS NULL
         ORDER BY tik.fecha_ingreso DESC
         LIMIT 1
       ) ult_ticket ON true
       ${where}
       ORDER BY ${col} ${dir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, tamano, offset]
    ),
  ]);

  return {
    datos: rows,
    total: total.rows[0].total,
    pagina,
    tamano,
    totalPaginas: Math.max(1, Math.ceil(total.rows[0].total / tamano)),
  };
}

// Consulta puntual usada por el modal de tickets para saber si la placa ya
// existe (y decidir si pedir tipo de vehículo y documento del propietario).
// Devuelve también el teléfono y el tipo_vehiculo_id para autocompletar el
// formulario cuando la placa ya está registrada.
export async function obtenerVehiculoPorPlaca(placa: string) {
  const placaLimpia = String(placa || "").toUpperCase().trim();

  const { rows } = await pool.query(
    `SELECT
       v.placa,
       v.estados_id_estado,
       t.tipo_vehiculo AS tipo,
       t.tipo_vehiculo_id,
       u.nombre,
       u.documento,
       u.telefono
     FROM vehiculos v
     JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
     JOIN usuarios u ON u.documento = v.usuarios_documento
     WHERE v.placa = $1 AND v.fecha_eliminado IS NULL
     LIMIT 1`,
    [placaLimpia]
  );

  return {
    existe: rows.length > 0,
    vehiculo: rows[0] || null,
  };
}

// Alta de vehículo mensual. Reglas:
//   1. Placa no puede duplicarse mientras esté activa (la garantiza el PK de
//      `vehiculos`: el INSERT choca y el catch traduce el 23505).
//   2. Si el propietario no existe, se crea como cliente.
//   3. Se asocia la tarifa mensual vigente y un puesto libre obligatorio.
//   4. Se genera un contrato de 1 mes desde NOW() y se ocupa el puesto.
//
// Validaciones, alta del cliente y las tres escrituras van DENTRO de la misma
// transacción, con FOR UPDATE sobre el puesto. Antes vivían fuera del BEGIN:
// dos altas concurrentes pasaban el mismo check "libre", y cualquier fallo
// posterior dejaba al cliente recién creado como huérfano (no había ROLLBACK
// que lo revirtiera).
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

  const cliente = await pool.connect();
  let clienteCreado = false;

  try {
    await cliente.query("BEGIN");

    const puesto = await cliente.query(
      `SELECT id_puesto, estado_puesto
       FROM puestos
       WHERE id_puesto = $1 AND fecha_eliminado IS NULL
       FOR UPDATE`,
      [puestoId]
    );

    if (!puesto.rows.length) {
      throw new ErrorDominio("El puesto no existe", 404);
    }

    if (puesto.rows[0].estado_puesto) {
      throw new ErrorDominio("El puesto ya está ocupado", 409);
    }

    // Sin pre-check de placa: el PK de `vehiculos` es la autoridad. El check
    // previo era una carrera en sí mismo (dos tx pasaban el SELECT y una
    // perdía en el INSERT) y costaba un round-trip en el happy path.
    const resultadoCliente = await crearClienteSiNoExiste(
      { doc: Number(doc), nombre, telefono },
      cliente
    );
    clienteCreado = resultadoCliente.creado;

    // Ambos catálogos son estáticos y se necesitan en la misma fila del
    // INSERT. Un SELECT con subselects escalares liquida los dos lookups de
    // los que antes se hacían por separado.
    const catalogo = await cliente.query(
      `SELECT
         (SELECT id_tarifa FROM tarifa
          WHERE tipo_vehiculo = 'mensual' AND fecha_eliminado IS NULL
          LIMIT 1) AS tarifa_id,
         (SELECT id_estado FROM estados
          WHERE nombre_estado = 'activo'
          LIMIT 1) AS estado_id`
    );

    const tarifaId = catalogo.rows[0].tarifa_id;
    const estadoId = catalogo.rows[0].estado_id;

    if (!tarifaId || !estadoId) {
      throw new ErrorDominio("Faltan tarifas o estados configurados", 500);
    }

    const docFinal = Number(doc);

    await cliente.query(
      `INSERT INTO vehiculos (placa, usuarios_documento, estados_id_estado, tarifa_id_tarifa, color)
       VALUES ($1, $2, $3, $4, $5)`,
      [placaLimpia, docFinal, estadoId, tarifaId, color]
    );

    await cliente.query(
      `INSERT INTO contratos (
         tarifa_id_tarifa, vehiculos_placa, usuarios_documento,
         estados_id_estado, fecha_inicio, fecha_fin,
         puestos_id_puesto
       )
       VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '1 month', $5)`,
      [tarifaId, placaLimpia, docFinal, estadoId, puestoId]
    );

    await cliente.query(
      `UPDATE puestos SET estado_puesto = TRUE WHERE id_puesto = $1`,
      [puestoId]
    );

    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK");
    // En esta transacción el 23505 puede venir de dos PK distintas:
    //   - `vehiculos`: otra alta ganó la carrera por la misma placa.
    //   - `usuarios` : race en crearClienteSiNoExiste con el mismo documento.
    // `err.table` distingue el origen sin acoplarse al nombre exacto de la
    // constraint. El catch anterior mapeaba cualquier 23505 a "placa
    // duplicada" y el mensaje quedaba mintiendo en el segundo caso.
    const err = e as { code?: string; table?: string };
    if (err?.code === "23505") {
      if (err.table === "vehiculos") {
        throw new ErrorDominio("La placa ya está registrada", 409);
      }
      if (err.table === "usuarios") {
        throw new ErrorDominio("El documento ya está registrado. Reintente.", 409);
      }
    }
    throw e;
  } finally {
    cliente.release();
  }

  return {
    ok: true,
    placa: placaLimpia,
    clienteCreado,
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

    // Fail-fast: si el caller reasigna puesto, verificar el contrato vigente y
    // leer su puesto actual ANTES de tocar vehiculos/usuarios/puestos. Un
    // vehículo sin contrato hacía varios UPDATEs antes de fallar y el ROLLBACK
    // deshacía todo, quemando locks sin motivo. Una sola lectura sirve para
    // validar y para conocer el puesto que hay que liberar después.
    const reasigna = puestosIdPuesto !== undefined && !Number.isNaN(Number(puestosIdPuesto));
    let puestoAnteriorId: number | null = null;

    if (reasigna) {
      const contratoVigente = await cliente.query(
        `SELECT puestos_id_puesto
         FROM contratos
         WHERE vehiculos_placa = $1
           AND fecha_eliminado IS NULL
           AND fecha_fin > NOW()
         ORDER BY fecha_inicio DESC
         LIMIT 1`,
        [placa]
      );
      if (!contratoVigente.rows.length) {
        throw new ErrorDominio(
          "El vehículo no tiene contrato vigente para reasignar puesto",
          404
        );
      }
      puestoAnteriorId = contratoVigente.rows[0].puestos_id_puesto;
    }

    // 1. Estado y color van en un solo UPDATE sobre vehiculos.
    const setV: string[] = [];
    const valsV: unknown[] = [];

    if (estado) {
      const er = await cliente.query(
        `SELECT id_estado FROM estados WHERE nombre_estado = $1 LIMIT 1`,
        [estado]
      );
      if (!er.rows.length) {
        throw new ErrorDominio(`Estado ${estado} no existe`, 400);
      }
      valsV.push(er.rows[0].id_estado);
      setV.push(`estados_id_estado = $${valsV.length}`);
    }

    if (color) {
      valsV.push(color);
      setV.push(`color = $${valsV.length}`);
    }

    if (setV.length) {
      valsV.push(placa);
      await cliente.query(
        `UPDATE vehiculos SET ${setV.join(", ")}
         WHERE placa = $${valsV.length} AND fecha_eliminado IS NULL`,
        valsV
      );
    }

    // 2. Al inactivar se liberan los puestos de tickets abiertos.
    //    El puesto del contrato se mantiene reservado para el cliente.
    if (estado === "inactivo") {
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

    // 3. Nombre del propietario (vive en usuarios).
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

    // 4. Reasignación de puesto del contrato vigente. El contrato ya se validó
    //    y su puesto actual quedó en `puestoAnteriorId` durante el fail-fast.
    if (reasigna) {
      const nuevoId = Number(puestosIdPuesto);

      // Si el id coincide, no hay nada que hacer. Importante verificar ANTES
      // de mirar estado_puesto: ese puesto aparece ocupado por este vehículo.
      if (Number(puestoAnteriorId) !== nuevoId) {
        // FOR UPDATE serializa dos reasignaciones concurrentes al mismo puesto.
        // Sin él, ambas pasaban el check y la segunda dejaba al primer vehículo
        // con un contrato apuntando a un puesto que ya ocupaba otro.
        const nuevo = await cliente.query(
          `SELECT id_puesto, estado_puesto
           FROM puestos
           WHERE id_puesto = $1 AND fecha_eliminado IS NULL
           FOR UPDATE`,
          [nuevoId]
        );
        if (!nuevo.rows.length) {
          throw new ErrorDominio("El puesto no existe", 404);
        }
        if (nuevo.rows[0].estado_puesto) {
          throw new ErrorDominio("El puesto ya está ocupado", 409);
        }

        await cliente.query(
          `UPDATE contratos SET puestos_id_puesto = $1
           WHERE vehiculos_placa = $2
             AND fecha_eliminado IS NULL
             AND fecha_fin > NOW()`,
          [nuevoId, placa]
        );

        // Un solo UPDATE para liberar el anterior y ocupar el nuevo.
        // Si `puestoAnteriorId` es null, `IN ($1, NULL)` sólo matchea el nuevo.
        await cliente.query(
          `UPDATE puestos
           SET estado_puesto = (id_puesto = $1)
           WHERE id_puesto IN ($1, $2) AND fecha_eliminado IS NULL`,
          [nuevoId, puestoAnteriorId ?? null]
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
// Libera el puesto del contrato activo, cierra el contrato y marca el vehículo
// como eliminado. Los tres UPDATE van en una transacción: si algo falla no queda
// un vehículo sin contrato o un puesto huérfano ocupado.
export async function eliminarVehiculoSoft(placa: string) {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    await cliente.query(
      `UPDATE puestos p
       SET estado_puesto = FALSE
       FROM contratos c
       WHERE c.vehiculos_placa = $1
         AND c.puestos_id_puesto = p.id_puesto
         AND c.fecha_eliminado IS NULL`,
      [placa]
    );

    await cliente.query(
      `UPDATE contratos
       SET fecha_eliminado = NOW(),
           estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo')
       WHERE vehiculos_placa = $1 AND fecha_eliminado IS NULL`,
      [placa]
    );

    await cliente.query(
      `UPDATE vehiculos SET fecha_eliminado = NOW()
       WHERE placa = $1 AND fecha_eliminado IS NULL`,
      [placa]
    );

    await cliente.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
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
// Un solo LATERAL trae el último contrato con su puesto y su fecha_fin; el
// CASE reproduce la regla anterior (puesto='—' si el contrato ya expiró) sin
// las dos subconsultas correlacionadas que había por fila.
export async function listarVehiculosInactivos() {
  const { rows } = await pool.query(`
    SELECT
      v.placa,
      u.documento::text AS doc,
      u.nombre,
      u.telefono,
      v.color,
      t.tipo_vehiculo AS tipo,
      CASE
        WHEN ult.fecha_fin > NOW() THEN ult.numero_puesto::text
        ELSE '—'
      END AS puesto,
      ult.contrato_fin
    FROM vehiculos v
    JOIN usuarios u ON u.documento = v.usuarios_documento
    JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
    JOIN estados e ON e.id_estado = v.estados_id_estado
    LEFT JOIN LATERAL (
      SELECT
        p.numero_puesto,
        c.fecha_fin,
        TO_CHAR(c.fecha_fin, 'DD-MM-YYYY') AS contrato_fin
      FROM contratos c
      LEFT JOIN puestos p ON p.id_puesto = c.puestos_id_puesto
      WHERE c.vehiculos_placa = v.placa
        AND c.fecha_eliminado IS NULL
      ORDER BY c.fecha_inicio DESC
      LIMIT 1
    ) ult ON true
    WHERE v.fecha_eliminado IS NULL
      AND t.tipo_vehiculo = 'mensual'
      AND e.nombre_estado = 'inactivo'
    ORDER BY v.placa
  `);

  return rows;
}
