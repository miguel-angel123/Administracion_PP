// Modelo de vehículos. Dos flujos:
//   - Mensual: alta desde este modelo, genera contrato.
//   - Diario: alta desde tickets.model cuando se crea el ticket.
// pool ejecuta consultas SQL contra PostgreSQL.
import pool from "@/lib/db";
// ErrorDominio permite que las APIs respondan con status controlado.
import { ErrorDominio } from "./errores";
// Se usa para crear o validar propietarios tipo cliente.
import { crearClienteSiNoExiste } from "./usuarios.model";
// Validaciones de formato con lanzamiento de error para el backend.
import { exigirPlaca, exigirDocumento, exigirTelefono, exigirTextoObligatorio } from "@/lib/validacion";

// Opciones aceptadas por el listado paginado de vehiculos.
interface OpcionesListado {
  // Pagina actual.
  pagina?: number;
  // Registros por pagina.
  tamano?: number;
  // Texto para buscar por placa o propietario.
  buscar?: string;
  // Columna permitida para ordenar.
  orden?: "placa" | "nombre" | "tipo" | "estado" | "ingreso";
  // Direccion del ordenamiento.
  dir?: "asc" | "desc";
  // Filtro de modalidad/estado.
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
  // Normaliza pagina minima.
  const pagina = Math.max(1, opts.pagina || 1);
  // Limita tamano para evitar consultas/respuestas demasiado grandes.
  const tamano = Math.min(100, Math.max(1, opts.tamano || 20));
  // Calcula desplazamiento SQL.
  const offset = (pagina - 1) * tamano;
  // Filtro por defecto: todos los activos.
  const filtro = opts.filtro || "todos";
  // Bandera para saber si hay busqueda textual real.
  const hayBuscar = !!(opts.buscar && opts.buscar.trim());

  // Filtro base: no mostrar vehiculos eliminados logicamente.
  const filtros: string[] = ["v.fecha_eliminado IS NULL"];
  // Parametros SQL dinamicos.
  const params: unknown[] = [];

  // Agrega busqueda por placa o nombre si existe.
  if (hayBuscar) {
    // ILIKE busca sin distinguir mayusculas/minusculas.
    params.push(`%${opts.buscar!.trim()}%`);
    // Numero del placeholder SQL recien agregado.
    const idx = params.length;
    // Busca coincidencia parcial en placa o nombre del propietario.
    filtros.push(`(v.placa ILIKE $${idx} OR u.nombre ILIKE $${idx})`);
  }

  // SQL reutilizable para estado activo.
  const estaActivo = `v.estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'activo')`;
  // SQL reutilizable para cualquier estado distinto de activo.
  const estaInactivo = `v.estados_id_estado <> (SELECT id_estado FROM estados WHERE nombre_estado = 'activo')`;

  // Aplica filtros de estado o modalidad.
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

  // Clausula WHERE final para conteo y listado.
  const where = "WHERE " + filtros.join(" AND ");

  // Mapa blanco de columnas ordenables.
  const cols: Record<string, string> = {
    placa: "v.placa",
    nombre: "u.nombre",
    tipo: "t.tipo_vehiculo",
    estado: "e.nombre_estado",
    ingreso: "ingreso",   
  };
  // Columna segura para ORDER BY.
  const col = cols[opts.orden || "placa"] || "v.placa";
  // Direccion segura para ORDER BY.
  const dir = opts.dir === "desc" ? "DESC" : "ASC";

  // El COUNT sólo necesita `vehiculos` (y `usuarios` si hay búsqueda por
  // nombre). El filtro de estado ya no exige joins: es una columna de vehiculos.
  const joinUsuariosCount = hayBuscar
    ? ` Join usuarios u ON u.documento = v.usuarios_documento`
    : "";

  // El estado sale directo de `e.nombre_estado`. El LATERAL de ult_contrato
  // sigue trayendo ingreso/fin/puesto y las condiciones económicas (para
  // mensual) y el de ult_ticket ingreso/salida/puesto del parqueo actual
  // (para diario): son datos que ninguna columna de vehiculos guarda.
  //
  // `pagado` mensual se calcula contra pagado_mes: al cambiar de mes, el bool
  // histórico deja de contar aunque siga en TRUE en la BD.
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
         tv.nombre AS clase_vehiculo,
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
           END, '—') AS puesto,
         COALESCE(CASE WHEN t.tipo_vehiculo = 'mensual' THEN ult_contrato.precio END,
                  NULL)::float AS precio,
         COALESCE(CASE WHEN t.tipo_vehiculo = 'mensual' THEN ult_contrato.dia_pago END,
                  NULL)::int   AS dia_pago,
         COALESCE(
           CASE WHEN t.tipo_vehiculo = 'mensual'
                THEN (ult_contrato.pagado AND ult_contrato.pagado_mes = TO_CHAR(NOW(), 'YYYY-MM'))
                ELSE ult_ticket.pagado
           END,
           FALSE)       AS pagado
       FROM vehiculos v
       JOIN usuarios u ON u.documento = v.usuarios_documento
       JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
       JOIN estados e ON e.id_estado = v.estados_id_estado
       LEFT JOIN tipos_vehiculo tv ON tv.id_tipo_vehiculo = t.tipo_vehiculo_id
       LEFT JOIN LATERAL (
         SELECT c.fecha_inicio, c.fecha_fin, p.numero_puesto,
                c.precio, c.dia_pago, c.pagado, c.pagado_mes
         FROM contratos c
         LEFT JOIN puestos p ON p.id_puesto = c.puestos_id_puesto
         WHERE c.vehiculos_placa = v.placa
           AND c.fecha_eliminado IS NULL
         ORDER BY c.fecha_inicio DESC
         LIMIT 1
       ) ult_contrato ON t.tipo_vehiculo = 'mensual'
       LEFT JOIN LATERAL (
         SELECT tik.id_ticket AS id, tik.fecha_ingreso, tik.fecha_salida,
                p.numero_puesto, tik.pagado
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
    // Vehiculos de la pagina actual.
    datos: rows,
    // Total de vehiculos que cumplen filtros.
    total: total.rows[0].total,
    // Pagina normalizada.
    pagina,
    // Tamano normalizado.
    tamano,
    // Total de paginas para paginador.
    totalPaginas: Math.max(1, Math.ceil(total.rows[0].total / tamano)),
  };
}

// Consulta puntual usada por el modal de tickets para saber si la placa ya
// existe (y decidir si pedir tipo de vehículo y documento del propietario).
// Devuelve también el teléfono y el tipo_vehiculo_id para autocompletar el
// formulario cuando la placa ya está registrada.
export async function obtenerVehiculoPorPlaca(placa: string) {
  // Normaliza placa a mayusculas y sin espacios extremos.
  const placaLimpia = String(placa || "").toUpperCase().trim();

  // Busca placa vigente con propietario y tipo de tarifa.
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
    // Booleano comodo para el frontend.
    existe: rows.length > 0,
    // Fila completa o null si no existe.
    vehiculo: rows[0] || null,
  };
}

// Alta de vehículo mensual. Reglas:
//   1. Placa no puede duplicarse mientras esté activa (la garantiza el PK de
//      `vehiculos`: el INSERT choca y el catch traduce el 23505).
//   2. Si el propietario no existe, se crea como cliente.
//   3. Se asocia la tarifa mensual vigente y un puesto libre obligatorio.
//   4. Se genera un contrato de 1 mes desde NOW(), con su precio y día de pago,
//      y se ocupa el puesto.
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
  precio?: number | string;
  diaPago?: number | string;
}) {
  // Extrae campos y define color por defecto.
  const {
    placa, doc, nombre, telefono, color = "No especificado",
    puestosIdPuesto, precio, diaPago,
  } = datos;
  // Normaliza placa antes de guardar.
  const placaLimpia = String(placa || "").toUpperCase().trim();
  // Convierte id de puesto a numero.
  const puestoId = Number(puestosIdPuesto);

  // Precio mensual: opcional, pero si llega debe ser un numero no negativo.
  const precioNum = precio !== undefined && precio !== "" ? Number(precio) : null;
  if (precioNum !== null && (!Number.isFinite(precioNum) || precioNum < 0)) {
    throw new ErrorDominio("El precio debe ser mayor o igual a 0", 400);
  }

  // Día de pago: opcional, dentro del mes calendario.
  const diaPagoNum = diaPago !== undefined && diaPago !== "" ? Number(diaPago) : null;
  if (diaPagoNum !== null && (!Number.isInteger(diaPagoNum) || diaPagoNum < 1 || diaPagoNum > 31)) {
    throw new ErrorDominio("El día de pago debe estar entre 1 y 31", 400);
  }

  // Validacion minima de placa/documento.
  if (!placaLimpia || !doc) {
    throw new ErrorDominio("La placa y el documento son obligatorios", 400);
  }

  // Valida que el puesto sea numerico y positivo.
  if (!puestoId || Number.isNaN(puestoId) || puestoId <= 0) {
    throw new ErrorDominio("Debe asignar un puesto al contrato", 400);
  }

  // Validación de formato. El route ya limpia (limpiarPlaca/limpiarDocumento),
  // pero un caller directo (script, server action futura) debe toparse con
  // las mismas reglas: antes "A1" o doc "12" pasaban la puerta de "no vacío".
  exigirPlaca(placaLimpia);
  exigirDocumento(doc);
  if (telefono) exigirTelefono(telefono);
  const nombreLimpio = nombre ? exigirTextoObligatorio(nombre, "El nombre", 100) : undefined;
  const colorLimpio = color ? exigirTextoObligatorio(color, "El color", 30) : "No especificado";

  // Reserva una conexion para manejar transaccion.
  const cliente = await pool.connect();
  // Bandera para informar si se creo cliente nuevo.
  let clienteCreado = false;

  try {
    // Inicia transaccion atomica.
    await cliente.query("BEGIN");

    // Lee y bloquea el puesto elegido.
    const puesto = await cliente.query(
      `SELECT id_puesto, estado_puesto
       FROM puestos
       WHERE id_puesto = $1 AND fecha_eliminado IS NULL
       FOR UPDATE`,
      [puestoId]
    );

    // Si no existe, no se puede asignar.
    if (!puesto.rows.length) {
      throw new ErrorDominio("El puesto no existe", 404);
    }

    // Si ya esta ocupado, bloquea la operacion.
    if (puesto.rows[0].estado_puesto) {
      throw new ErrorDominio("El puesto ya está ocupado", 409);
    }

    // Sin pre-check de placa: el PK de `vehiculos` es la autoridad. El check
    // previo era una carrera en sí mismo (dos tx pasaban el SELECT y una
    // perdía en el INSERT) y costaba un round-trip en el happy path.
    const resultadoCliente = await crearClienteSiNoExiste(
      { doc: Number(doc), nombre: nombreLimpio, telefono },
      cliente
    );
    // Guarda si la operacion creo/revivio cliente.
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

    // Id de tarifa mensual vigente.
    const tarifaId = catalogo.rows[0].tarifa_id;
    // Id del estado activo.
    const estadoId = catalogo.rows[0].estado_id;

    // Sin catalogos base no se puede crear vehiculo.
    if (!tarifaId || !estadoId) {
      throw new ErrorDominio("Faltan tarifas o estados configurados", 500);
    }

    // Documento como numero definitivo.
    const docFinal = Number(doc);

    // Inserta vehiculo mensual.
    await cliente.query(
      `INSERT INTO vehiculos (placa, usuarios_documento, estados_id_estado, tarifa_id_tarifa, color)
       VALUES ($1, $2, $3, $4, $5)`,
      [placaLimpia, docFinal, estadoId, tarifaId, colorLimpio]
    );

    // Inserta contrato mensual de un mes.
    await cliente.query(
      `INSERT INTO contratos (
         tarifa_id_tarifa, vehiculos_placa, usuarios_documento,
         estados_id_estado, fecha_inicio, fecha_fin,
         puestos_id_puesto, precio, dia_pago
       )
       VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '1 month', $5, $6, $7)`,
      [tarifaId, placaLimpia, docFinal, estadoId, puestoId, precioNum, diaPagoNum]
    );

    // Marca el puesto como ocupado.
    await cliente.query(
      `UPDATE puestos SET estado_puesto = TRUE WHERE id_puesto = $1`,
      [puestoId]
    );

    // Confirma las tres escrituras.
    await cliente.query("COMMIT");
  } catch (e) {
    // Revierte todo si algo falla.
    await cliente.query("ROLLBACK");
    // En esta transacción el 23505 puede venir de dos PK distintas:
    //   - `vehiculos`: otra alta ganó la carrera por la misma placa.
    //   - `usuarios` : race en crearClienteSiNoExiste con el mismo documento.
    // `err.table` distingue el origen sin acoplarse al nombre exacto de la
    // constraint. El catch anterior mapeaba cualquier 23505 a "placa
    // duplicada" y el mensaje quedaba mintiendo en el segundo caso.
    const err = e as { code?: string; table?: string };
    // 23505 es violacion de unicidad.
    if (err?.code === "23505") {
      if (err.table === "vehiculos") {
        throw new ErrorDominio("La placa ya está registrada", 409);
      }
      if (err.table === "usuarios") {
        throw new ErrorDominio("El documento ya está registrado. Reintente.", 409);
      }
    }
    // Cualquier otro error se propaga.
    throw e;
  } finally {
    // Siempre devuelve la conexion al pool.
    cliente.release();
  }

  // Respuesta usada por el controlador.
  return {
    ok: true,
    placa: placaLimpia,
    clienteCreado,
  };
}

// Actualiza un vehículo: estado, color, nombre del propietario, puesto del
// contrato (o del ticket abierto), condiciones económicas y clase (tarifa).
// Todo va en una transacción: si algo falla, no queda un cambio parcial.
// - estado: "activo" | "inactivo".
//   * Al pasar a "inactivo" se liberan tanto los puestos de tickets abiertos
//     como el del contrato vigente, y el contrato queda desvinculado
//     (puestos_id_puesto = NULL): el vehículo sale del mapa y su puesto queda
//     realmente disponible. Reactivar exige elegir puesto nuevo.
//   * Al pasar a "activo" se reocupa el puesto del contrato vigente si sigue
//     libre (si otro vehículo lo tomó mientras estaba inactivo, no se pisa).
// - color: cambia el color del vehículo.
// - nombre: cambia el nombre del propietario (vive en usuarios).
// - puestosIdPuesto: reasigna el puesto del contrato vigente (mensual) o del
//   ticket abierto (diario). El origen se decide en runtime.
// - precio / diaPago: condiciones del contrato vigente (solo mensual).
// - pagado: contrato vigente (mensual) o ticket abierto (diario).
//   En mensual, marcar pagado sella `pagado_mes` con el mes en curso; marcar
//   pendiente lo borra. Al cambiar de mes el tooltip pasa a "Pendiente" sin
//   tocar el bool histórico.
// - clase: nombre del tipo de vehículo; reasigna la tarifa vigente.
export async function actualizarVehiculo(
  placa: string,
  cambios: {
    estado?: string;
    color?: string;
    nombre?: string;
    puestosIdPuesto?: number;
    precio?: number;
    diaPago?: number;
    pagado?: boolean;
    clase?: string;
  }
) {
  // Extrae los cambios permitidos.
  const { estado, color, nombre, puestosIdPuesto, precio, diaPago, pagado, clase } = cambios;
  // Reserva conexion para transaccion.
  const cliente = await pool.connect();

  try {
    // Inicia transaccion.
    await cliente.query("BEGIN");

    // Fail-fast: si el caller reasigna puesto, verificar el contrato vigente
    // (o, si no hay, el ticket abierto) y leer su puesto actual ANTES de tocar
    // vehiculos/usuarios/puestos. Un vehículo sin ocupación hacía varios
    // UPDATEs antes de fallar y el ROLLBACK deshacía todo, quemando locks sin
    // motivo. Una sola lectura sirve para validar y para conocer el puesto que
    // hay que liberar después.
    const reasigna = puestosIdPuesto !== undefined && !Number.isNaN(Number(puestosIdPuesto));
    // Puesto actual del contrato o ticket, si se va a reasignar.
    let puestoAnteriorId: number | null = null;
    // De dónde viene la ocupación: define dónde escribir el nuevo puesto.
    let origenOcupacion: "contrato" | "ticket" | null = null;

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

      if (contratoVigente.rows.length) {
        origenOcupacion = "contrato";
        puestoAnteriorId = contratoVigente.rows[0].puestos_id_puesto;
      } else {
        // Sin contrato vigente se cae al ticket abierto: un diario en el
        // parqueadero también debe poder reasignarse desde el mapa.
        const ticketAbierto = await cliente.query(
          `SELECT puestos_id_puesto
           FROM tickets
           WHERE vehiculos_placa = $1
             AND fecha_salida IS NULL
             AND fecha_eliminado IS NULL
           ORDER BY fecha_ingreso DESC
           LIMIT 1`,
          [placa]
        );
        if (!ticketAbierto.rows.length) {
          throw new ErrorDominio(
            "El vehículo no tiene contrato ni ticket vigente para reasignar puesto",
            404
          );
        }
        origenOcupacion = "ticket";
        puestoAnteriorId = ticketAbierto.rows[0].puestos_id_puesto;
      }
    }

    // Condiciones económicas del contrato vigente. Un solo UPDATE dinámico,
    // igual que el de vehiculos. Si no hay contrato vigente se avisa con 404
    // en vez de actualizar cero filas en silencio.
    const setC: string[] = [];
    const valsC: unknown[] = [];
    if (precio !== undefined) {
      if (!Number.isFinite(precio) || precio < 0) throw new ErrorDominio("Precio inválido", 400);
      valsC.push(precio); setC.push(`precio = $${valsC.length}`);
    }
    if (diaPago !== undefined) {
      if (!Number.isInteger(diaPago) || diaPago < 1 || diaPago > 31) {
        throw new ErrorDominio("El día de pago debe estar entre 1 y 31", 400);
      }
      valsC.push(diaPago); setC.push(`dia_pago = $${valsC.length}`);
    }
    if (setC.length) {
      valsC.push(placa);
      const r = await cliente.query(
        `UPDATE contratos SET ${setC.join(", ")}
         WHERE vehiculos_placa = $${valsC.length}
           AND fecha_eliminado IS NULL
           AND fecha_fin > NOW()`,
        valsC
      );
      if (r.rowCount === 0) {
        throw new ErrorDominio("El vehículo no tiene contrato vigente", 404);
      }
    }

    // Estado de pago: mensual lo lleva en contratos, diario en el ticket
    // abierto. Va separado del bloque anterior para no acoplar la búsqueda
    // de contrato con el flujo de tickets.
    if (pagado !== undefined) {
      const tipo = await cliente.query(
        `SELECT t.tipo_vehiculo
         FROM vehiculos v
         JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
         WHERE v.placa = $1 AND v.fecha_eliminado IS NULL`,
        [placa]
      );
      if (!tipo.rows.length) {
        throw new ErrorDominio("Vehículo no encontrado", 404);
      }

      if (tipo.rows[0].tipo_vehiculo === "mensual") {
        // Marcar pagado sella el mes en curso; desmarcar borra el sello.
        const r = await cliente.query(
          `UPDATE contratos
           SET pagado = $1,
               pagado_mes = CASE WHEN $1 THEN TO_CHAR(NOW(), 'YYYY-MM') ELSE NULL END
           WHERE vehiculos_placa = $2
             AND fecha_eliminado IS NULL
             AND fecha_fin > NOW()`,
          [pagado, placa]
        );
        if (r.rowCount === 0) {
          throw new ErrorDominio("El vehículo no tiene contrato vigente", 404);
        }
      } else {
        const r = await cliente.query(
          `UPDATE tickets SET pagado = $1
           WHERE vehiculos_placa = $2
             AND fecha_salida IS NULL
             AND fecha_eliminado IS NULL`,
          [pagado, placa]
        );
        if (r.rowCount === 0) {
          throw new ErrorDominio("El vehículo no tiene ticket abierto", 404);
        }
      }
    }

    // Cambio de clase: reasigna la tarifa vigente al tipo cuyo nombre coincide.
    // El frontend envía el `nombre` exacto de tipos_vehiculo.
    if (clase) {
      const tar = await cliente.query(
        `SELECT t.id_tarifa
         FROM vehiculos v
         JOIN tarifa  actual ON actual.id_tarifa = v.tarifa_id_tarifa
         JOIN tarifa  t      ON t.tipo_vehiculo = actual.tipo_vehiculo
         JOIN tipos_vehiculo tv ON tv.id_tipo_vehiculo = t.tipo_vehiculo_id
         WHERE v.placa = $1
           AND v.fecha_eliminado IS NULL
           AND tv.nombre = $2
           AND t.fecha_eliminado IS NULL
         LIMIT 1`,
        [placa, clase]
      );
      if (!tar.rows.length) {
        throw new ErrorDominio(`No existe la clase ${clase}`, 400);
      }
      await cliente.query(
        `UPDATE vehiculos SET tarifa_id_tarifa = $1
         WHERE placa = $2 AND fecha_eliminado IS NULL`,
        [tar.rows[0].id_tarifa, placa]
      );
    }

    // 1. Estado y color van en un solo UPDATE sobre vehiculos.
    // setV guarda fragmentos tipo "color = $1".
    const setV: string[] = [];
    // valsV guarda los valores correspondientes.
    const valsV: unknown[] = [];

    // Si cambia estado, resuelve el id_estado.
    if (estado) {
      const er = await cliente.query(
        `SELECT id_estado FROM estados WHERE nombre_estado = $1 LIMIT 1`,
        [estado]
      );
      if (!er.rows.length) {
        throw new ErrorDominio(`Estado ${estado} no existe`, 400);
      }
      // Agrega estado al UPDATE dinamico.
      valsV.push(er.rows[0].id_estado);
      setV.push(`estados_id_estado = $${valsV.length}`);
    }

    // Si cambia color, lo agrega al UPDATE dinamico.
    if (color) {
      valsV.push(color);
      setV.push(`color = $${valsV.length}`);
    }

    // Ejecuta UPDATE de vehiculo solo si hay algo que cambiar.
    if (setV.length) {
      // La placa es el ultimo parametro.
      valsV.push(placa);
      await cliente.query(
        `UPDATE vehiculos SET ${setV.join(", ")}
         WHERE placa = $${valsV.length} AND fecha_eliminado IS NULL`,
        valsV
      );
    }

    // 2. Cambio de estado → sincroniza la ocupación del puesto.
    //    Inactivar libera; reactivar reocupa el que el contrato reservó.
    //    `puestos.estado_puesto` es lo que lee ajustarTotalPuestos (el mapa
    //    se deriva de JOINs, así que sin esto la columna miente y un ajuste
    //    de total podría borrar un puesto en uso).
    if (estado === "inactivo") {
      // Contrato vigente: libera el puesto reservado al mensual.
      await cliente.query(
        `UPDATE puestos p SET estado_puesto = FALSE
         FROM contratos c
         WHERE c.vehiculos_placa = $1
           AND c.puestos_id_puesto = p.id_puesto
           AND c.fecha_eliminado IS NULL
           AND c.fecha_fin > NOW()`,
        [placa]
      );
      // Desvincula el puesto del contrato: el vehículo inactivo no tiene
      // ubicación en BD. Reactivar exige elegir una nueva (ver bloque "activo"
      // / reasigna).
      await cliente.query(
        `UPDATE contratos SET puestos_id_puesto = NULL
         WHERE vehiculos_placa = $1
           AND fecha_eliminado IS NULL
           AND fecha_fin > NOW()`,
        [placa]
      );
      // Ticket abierto (diario): mismo tratamiento de liberación.
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

    if (estado === "activo") {
      // Solo reocupa si sigue libre: si otro vehículo lo tomó mientras este
      // estaba inactivo, no se pisa.
      await cliente.query(
        `UPDATE puestos p SET estado_puesto = TRUE
         FROM contratos c
         WHERE c.vehiculos_placa = $1
           AND c.puestos_id_puesto = p.id_puesto
           AND c.fecha_eliminado IS NULL
           AND c.fecha_fin > NOW()
           AND p.fecha_eliminado IS NULL
           AND p.estado_puesto = FALSE`,
        [placa]
      );
    }

    // 3. Nombre del propietario (vive en usuarios).
    // Solo actualiza si llega nombre no vacio.
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

    // 4. Reasignación de puesto. El contrato (o ticket) ya se validó y su
    //    puesto actual quedó en `puestoAnteriorId` durante el fail-fast.
    // Si no venia puestosIdPuesto, esta seccion no corre.
    if (reasigna) {
      // Normaliza el nuevo puesto.
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

        // Escribe el nuevo puesto en la tabla que ostenta la ocupación:
        // contrato vigente (mensual) o ticket abierto (diario).
        if (origenOcupacion === "contrato") {
          await cliente.query(
            `UPDATE contratos SET puestos_id_puesto = $1
             WHERE vehiculos_placa = $2
               AND fecha_eliminado IS NULL
               AND fecha_fin > NOW()`,
            [nuevoId, placa]
          );
        } else {
          await cliente.query(
            `UPDATE tickets SET puestos_id_puesto = $1
             WHERE vehiculos_placa = $2
               AND fecha_salida IS NULL
               AND fecha_eliminado IS NULL`,
            [nuevoId, placa]
          );
        }

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

    // Confirma todos los cambios.
    await cliente.query("COMMIT");
    // Respuesta simple para la API.
    return { ok: true };
  } catch (e) {
    // Revierte cualquier cambio parcial.
    await cliente.query("ROLLBACK");
    // Propaga el error para que el route.ts responda.
    throw e;
  } finally {
    // Libera la conexion.
    cliente.release();
  }
}

// Soft delete: se conserva el registro para historial, pero deja de aparecer.
// Libera el puesto del contrato activo, cierra el contrato y marca el vehículo
// como eliminado. Los tres UPDATE van en una transacción: si algo falla no queda
// un vehículo sin contrato o un puesto huérfano ocupado.
export async function eliminarVehiculoSoft(placa: string) {
  // Reserva conexion para transaccion.
  const cliente = await pool.connect();

  try {
    // Inicia transaccion.
    await cliente.query("BEGIN");

    // Libera puestos asociados a contratos del vehiculo.
    await cliente.query(
      `UPDATE puestos p
       SET estado_puesto = FALSE
       FROM contratos c
       WHERE c.vehiculos_placa = $1
         AND c.puestos_id_puesto = p.id_puesto
         AND c.fecha_eliminado IS NULL`,
      [placa]
    );

    // Marca contratos como eliminados/inactivos.
    await cliente.query(
      `UPDATE contratos
       SET fecha_eliminado = NOW(),
           estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo')
       WHERE vehiculos_placa = $1 AND fecha_eliminado IS NULL`,
      [placa]
    );

    // Marca el vehiculo como eliminado logicamente.
    await cliente.query(
      `UPDATE vehiculos SET fecha_eliminado = NOW()
       WHERE placa = $1 AND fecha_eliminado IS NULL`,
      [placa]
    );

    // Confirma los tres cambios.
    await cliente.query("COMMIT");
    // Respuesta simple.
    return { ok: true };
  } catch (e) {
    // Revierte si algo falla.
    await cliente.query("ROLLBACK");
    // Propaga error.
    throw e;
  } finally {
    // Devuelve conexion al pool.
    cliente.release();
  }
}

// Catálogo de tipos de vehículo. Antes vivía como SQL suelto en el controlador
// de /api/vehiculos; se centraliza aquí para mantener MVC estricto.
export async function listarTiposVehiculo() {
  // Consulta tipos de vehiculo vigentes ordenados por id.
  const { rows } = await pool.query(
    `SELECT id_tipo_vehiculo::text AS id, nombre, icono
     FROM tipos_vehiculo
     WHERE fecha_eliminado IS NULL
     ORDER BY id_tipo_vehiculo`
  );

  // Devuelve el catalogo a la API.
  return rows;
}

// Vehículos mensuales con estado "inactivo" (papelera de reciclaje).
// Siguen teniendo su contrato vigente, pero el vehículo quedó suspendido.
// Un solo LATERAL trae el último contrato con su puesto y su fecha_fin; el
// CASE reproduce la regla anterior (puesto='—' si el contrato ya expiró) sin
// las dos subconsultas correlacionadas que había por fila.
export async function listarVehiculosInactivos() {
  // Consulta vehiculos mensuales suspendidos, con datos de propietario/contrato.
  const { rows } = await pool.query(`
    SELECT
      v.placa,
      u.documento::text AS doc,
      u.nombre,
      u.telefono,
      v.color,
      tv.nombre AS clase_vehiculo,
      t.tipo_vehiculo AS tipo,
      CASE
        WHEN ult.numero_puesto IS NOT NULL AND ult.fecha_fin > NOW()
          THEN ult.numero_puesto::text
        ELSE '—'
      END AS puesto
    FROM vehiculos v
    JOIN usuarios u ON u.documento = v.usuarios_documento
    JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
    JOIN estados e ON e.id_estado = v.estados_id_estado
    LEFT JOIN tipos_vehiculo tv ON tv.id_tipo_vehiculo = t.tipo_vehiculo_id
    LEFT JOIN LATERAL (
      SELECT
        p.numero_puesto,
        c.fecha_fin
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

  // Devuelve las filas tal como las necesita el frontend.
  return rows;
}
