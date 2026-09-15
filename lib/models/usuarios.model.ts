// Modelo de usuarios: empleados, clientes y alta automática.
// Reglas de rol y manejo de contraseñas viven aquí.
// PoolClient se usa cuando una funcion debe participar en una transaccion externa.
import type { PoolClient } from "pg";
// bcryptjs permite hashear contrasenas antes de guardarlas.
import bcrypt from "bcryptjs";
// pool ejecuta consultas directas cuando no se recibe transaccion externa.
import pool from "@/lib/db";
// ErrorDominio permite devolver errores HTTP controlados desde APIs.
import { ErrorDominio } from "./errores";
// Validaciones de formato con lanzamiento de error para el backend.
import { exigirDocumento, exigirTelefono, exigirCorreo, exigirTextoObligatorio } from "@/lib/validacion";

// Contratos de entrada.
// Datos esperados para crear o actualizar empleados.
export interface DatosEmpleado {
  // Documento unico del empleado.
  doc: number;
  // Nombre obligatorio del empleado.
  nombre: string;
  // Cargo opcional dentro del parqueadero.
  cargo?: string;
  // Telefono opcional.
  telefono?: string;
  // Correo opcional.
  correo?: string;
  // Contrasena opcional; si no llega, se preserva o usa fallback al crear.
  password?: string;
  // Estado opcional: activo, inactivo, trabajando o descansando.
  estado?: string;
}

// Datos minimos para crear un cliente automaticamente.
export interface DatosCliente {
  // Documento unico del cliente.
  doc: number;
  // Nombre opcional; si no llega se genera uno.
  nombre?: string;
  // Telefono opcional; puede actualizarse si el cliente ya existe.
  telefono?: string;
  // Correo opcional; si no llega se genera uno local.
  correo?: string;
}

// Opciones de listado usadas por endpoints con paginacion.
interface OpcionesListado {
  // Pagina actual empezando en 1.
  pagina?: number;
  // Cantidad de registros por pagina.
  tamano?: number;
  // Texto de busqueda por nombre o documento.
  buscar?: string;
  // Columna permitida para ordenar.
  orden?: "nombre" | "cargo" | "documento";
  // Direccion de ordenamiento.
  dir?: "asc" | "desc";
}

// bcrypt cost 10 tarda ~80 ms. Reusar el mismo hash para la contraseña de
// fallback ("123456") evita gastar CPU en cada update de empleado sin password.
// No es regresión de seguridad: todos esos usuarios ya comparten la misma
// password por diseño; el hash bcrypt incluye su propio salt.
let hashFallbackPromise: Promise<string> | null = null;
// Devuelve una promesa compartida con el hash de la contrasena por defecto.
function getHashFallback() {
  // Si todavia no existe, se calcula una sola vez.
  if (!hashFallbackPromise) hashFallbackPromise = bcrypt.hash("123456", 10);
  // Devuelve el hash ya creado o en proceso.
  return hashFallbackPromise;
}

// Lista usuarios por nombre de rol con paginación y orden server-side.
// Excluye soft-deleted.
export async function listarUsuariosPorRol(rol: string, opts: OpcionesListado = {}) {
  // Evita paginas menores a 1.
  const pagina = Math.max(1, opts.pagina || 1);
  // Limita el tamano entre 1 y 100 para evitar respuestas enormes.
  const tamano = Math.min(100, Math.max(1, opts.tamano || 20));
  // Calcula cuantos registros saltar en SQL.
  const offset = (pagina - 1) * tamano;

  // Filtros base: rol solicitado y usuarios no eliminados.
  const filtros: string[] = ["r.nombre_rol = $1", "u.fecha_eliminado IS NULL"];
  // Primer parametro SQL: el rol.
  const params: unknown[] = [rol];

  // Si hay texto de busqueda, agrega filtro dinamico.
  if (opts.buscar && opts.buscar.trim()) {
    // ILIKE con porcentajes busca coincidencias parciales sin distinguir mayusculas.
    params.push(`%${opts.buscar.trim()}%`);
    // idx representa el numero de placeholder SQL que acabamos de agregar.
    const idx = params.length;
    // Busca por nombre o por documento convertido a texto.
    filtros.push(`(u.nombre ILIKE $${idx} OR u.documento::text ILIKE $${idx})`);
  }

  // Une todos los filtros en una clausula WHERE.
  const where = "WHERE " + filtros.join(" AND ");

  // Mapa blanco de columnas permitidas para ORDER BY.
  const cols: Record<string, string> = {
    nombre: "u.nombre",
    cargo: "COALESCE(u.cargo, '')",
    documento: "u.documento",
  };
  // Elige columna segura, evitando inyeccion SQL por ORDER BY.
  const col = cols[opts.orden || "nombre"] || "u.nombre";
  // Normaliza direccion de orden; por defecto ASC.
  const dir = opts.dir === "desc" ? "DESC" : "ASC";

  // Ejecuta conteo y consulta de datos en paralelo.
  const [total, { rows }] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM usuarios u
       JOIN roles r ON r.id_roles = u.roles_id_roles
       ${where}`,
      params
    ),
    pool.query(
      `SELECT
         u.documento AS doc,
         u.nombre,
         COALESCE(u.cargo, '') AS cargo,
         COALESCE(u.telefono, '') AS telefono,
         COALESCE(u.correo, '') AS correo,
         e.nombre_estado AS estado
       FROM usuarios u
       JOIN roles r ON r.id_roles = u.roles_id_roles
       JOIN estados e ON e.id_estado = u.estados_id_estado
       ${where}
       ORDER BY ${col} ${dir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, tamano, offset]
    ),
  ]);

  return {
    // Registros de la pagina actual.
    datos: rows,
    // Total global de coincidencias.
    total: total.rows[0].total,
    // Pagina normalizada.
    pagina,
    // Tamano normalizado.
    tamano,
    // Cantidad total de paginas; minimo 1 para simplificar la UI.
    totalPaginas: Math.max(1, Math.ceil(total.rows[0].total / tamano)),
  };
}

// Devuelve el usuario con rol y estado, incluyendo si está eliminado.
// Usado antes de crear/actualizar y para validar propietarios.
// Acepta un `client` (transacción abierta por el llamador) para que la lectura
// vea el estado no confirmado de la propia transacción.
export async function obtenerUsuarioConRol(doc: number, client?: PoolClient) {
  // Usa la transaccion recibida o el pool general.
  const q = client ?? pool;
  // Consulta usuario con nombres de rol/estado y bandera de eliminado.
  const { rows } = await q.query(
    `SELECT
       u.documento,
       u.nombre,
       u.telefono,
       u.correo,
       r.nombre_rol AS role,
       e.nombre_estado AS estado,
       (u.fecha_eliminado IS NOT NULL) AS eliminado
     FROM usuarios u
     JOIN roles r ON r.id_roles = u.roles_id_roles
     JOIN estados e ON e.id_estado = u.estados_id_estado
     WHERE u.documento = $1`,
    [doc]
  );

  // Devuelve primera fila o null si no existe.
  return rows[0] || null;
}

// Crea o actualiza un empleado. Hashea la contraseña y fuerza rol "empleado".
// Estado (si viene) se resuelve antes del INSERT para que el ON CONFLICT
// absorba ambos caminos en un solo statement.
// Si el llamador no manda contraseña, el ON CONFLICT preserva la existente en
// vez de sobrescribirla con el fallback. Antes, editar otros campos de un
// empleado existente sin password lo reseteaba a "123456" en silencio.
// El upsert también promueve un doc existente a rol "empleado": un cliente
// registrado con el mismo documento cambia de rol sin rama adicional.
export async function crearEmpleado(datos: DatosEmpleado) {
  // Valida formato antes de tocar la BD: la FK de rol no protege contra un
  // documento 0 (proveniente de limpiarDocumento("abc") → Number("") = 0).
  exigirDocumento(datos.doc);
  const nombreLimpio = exigirTextoObligatorio(datos.nombre, "El nombre", 100);
  if (datos.telefono) exigirTelefono(datos.telefono);
  if (datos.correo) exigirCorreo(datos.correo);

  // Determina si el caller envio una contrasena real.
  const passwordProvided =
    typeof datos.password === "string" && datos.password.length > 0;
  // Si hay contrasena, se hashea; si no, usa hash fallback.
  const hash = passwordProvided
    ? await bcrypt.hash(datos.password as string, 10)
    : await getHashFallback();

  // Id numerico del estado si se envio uno.
  let estadoId: number | null = null;
  // Fecha de soft delete si el estado es inactivo.
  let fechaEliminado: Date | null = null;

  // Si viene estado, valida que exista en el catalogo.
  if (datos.estado) {
    const er = await pool.query(
      `SELECT id_estado FROM estados WHERE nombre_estado = $1 LIMIT 1`,
      [datos.estado]
    );
    if (!er.rows.length) {
      throw new ErrorDominio(`Estado ${datos.estado} no existe`, 400);
    }
    // Guarda el id para usarlo en el INSERT/UPDATE.
    estadoId = er.rows[0].id_estado;
    // Inactivo equivale a soft delete; otros estados reviven/activan.
    fechaEliminado = datos.estado === "inactivo" ? new Date() : null;
  }

  // Upsert: crea el empleado o actualiza el existente por documento.
  const { rows } = await pool.query(
    `INSERT INTO usuarios (
       documento, estados_id_estado, roles_id_roles,
       nombre, telefono, correo, contraseña, cargo, fecha_eliminado
     )
     SELECT
       $1,
       COALESCE($7::int, e.id_estado),
       r.id_roles,
       $2, $3, $4, $5, $6,
       $8::timestamp
     FROM estados e, roles r
     WHERE e.nombre_estado = 'activo' AND r.nombre_rol = 'empleado'
     ON CONFLICT (documento) DO UPDATE SET
       nombre = EXCLUDED.nombre,
       roles_id_roles = EXCLUDED.roles_id_roles,
       cargo = EXCLUDED.cargo,
       telefono = EXCLUDED.telefono,
       correo = EXCLUDED.correo,
       contraseña = CASE
         WHEN $9::boolean THEN EXCLUDED.contraseña
         ELSE usuarios.contraseña
       END,
       estados_id_estado = COALESCE($7::int, usuarios.estados_id_estado),
       fecha_eliminado = CASE
         WHEN $7::int IS NULL THEN usuarios.fecha_eliminado
         ELSE $8::timestamp
       END
     RETURNING documento AS doc`,
    [
      datos.doc,
      nombreLimpio,
      datos.telefono || "",
      datos.correo || "",
      hash,
      datos.cargo || null,
      estadoId,
      fechaEliminado,
      passwordProvided,
    ]
  );

  // Devuelve el documento creado/actualizado.
  return rows[0];
}

// Actualiza parcialmente. Estado se resuelve aquí adentro para que el cambio
// de rol/estado entre en el mismo UPDATE que el resto de los campos.
export async function actualizarUsuario(
  doc: number,
  cambios: {
    nombre?: string;
    cargo?: string;
    telefono?: string;
    correo?: string;
    password?: string;
    estado?: string;
  }
) {
  // Normaliza y valida lo que llegue: un PATCH sin pasar por el formulario
  // antes colaba correo "noesunmail" o nombre vacío directo al UPDATE.
  if (cambios.nombre !== undefined) {
    cambios.nombre = exigirTextoObligatorio(cambios.nombre, "El nombre", 100);
  }
  if (cambios.telefono !== undefined && cambios.telefono) exigirTelefono(cambios.telefono);
  if (cambios.correo !== undefined && cambios.correo) exigirCorreo(cambios.correo);
  if (cambios.cargo !== undefined && cambios.cargo) {
    cambios.cargo = exigirTextoObligatorio(cambios.cargo, "El cargo", 50);
  }

  // Fragmentos SET dinamicos del UPDATE.
  const sets: string[] = [];
  // Valores parametrizados en el mismo orden que los SET.
  const values: unknown[] = [];

  // Agrega nombre al UPDATE si fue enviado.
  if (cambios.nombre !== undefined) {
    values.push(cambios.nombre);
    sets.push(`nombre = $${values.length}`);
  }

  // Agrega cargo al UPDATE si fue enviado.
  if (cambios.cargo !== undefined) {
    values.push(cambios.cargo);
    sets.push(`cargo = $${values.length}`);
  }

  // Agrega telefono al UPDATE si fue enviado.
  if (cambios.telefono !== undefined) {
    values.push(cambios.telefono);
    sets.push(`telefono = $${values.length}`);
  }

  // Agrega correo al UPDATE si fue enviado.
  if (cambios.correo !== undefined) {
    values.push(cambios.correo);
    sets.push(`correo = $${values.length}`);
  }

  // Si hay nueva contrasena, se hashea antes de guardar.
  if (cambios.password) {
    const hash = await bcrypt.hash(cambios.password, 10);
    values.push(hash);
    sets.push(`contraseña = $${values.length}`);
  }

  // Si hay cambio de estado, resuelve su id en la tabla estados.
  if (cambios.estado) {
    const er = await pool.query(
      `SELECT id_estado FROM estados WHERE nombre_estado = $1 LIMIT 1`,
      [cambios.estado]
    );
    if (!er.rows.length) {
      throw new ErrorDominio(`Estado ${cambios.estado} no existe`, 400);
    }
    // Agrega el nuevo estado al UPDATE.
    values.push(er.rows[0].id_estado);
    sets.push(`estados_id_estado = $${values.length}`);
    // Inactivo marca fecha_eliminado; otros estados limpian esa fecha.
    values.push(cambios.estado === "inactivo" ? new Date() : null);
    sets.push(`fecha_eliminado = $${values.length}`);
  }

  // Si no hay cambios, no ejecuta SQL inutil.
  if (!sets.length) {
    throw new ErrorDominio("No hay campos para actualizar", 400);
  }

  // RETURNING convierte el UPDATE en su propio chequeo de existencia: si el
  // documento no está, no hay fila devuelta. Antes el llamador debía asumir
  // éxito sin señal alguna.
  values.push(doc);
  // Ejecuta UPDATE dinamico con placeholders ya construidos.
  const { rows } = await pool.query(
    `UPDATE usuarios SET ${sets.join(", ")}
     WHERE documento = $${values.length}
     RETURNING documento`,
    values
  );

  // Si RETURNING no trajo filas, el usuario no existia.
  if (!rows.length) {
    throw new ErrorDominio("Usuario no encontrado", 404);
  }

  // Respuesta simple para endpoints.
  return { ok: true };
}

// Cambia el estado del usuario por nombre ("activo", "trabajando", "descansando", "inactivo").
// Regla: "inactivo" implica soft delete (fecha_eliminado); el resto limpia esa fecha.
// Un solo statement: el id del estado se resuelve en el FROM estados y la fecha
// se decide por CASE, sin un SELECT previo.
export async function cambiarEstadoPorNombre(doc: number, nombreEstado: string) {
  // Actualiza estado resolviendo el id por nombre dentro del mismo SQL.
  const { rowCount } = await pool.query(
    `UPDATE usuarios u
     SET estados_id_estado = e.id_estado,
         fecha_eliminado = CASE WHEN $2 = 'inactivo' THEN NOW() ELSE NULL END
     FROM estados e
     WHERE e.nombre_estado = $2 AND u.documento = $1`,
    [doc, nombreEstado]
  );

  // rowCount = 0 tanto si el usuario no existe como si el estado no existe.
  // Se elige un solo mensaje a cambio de no hacer un SELECT previo: los
  // llamadores sólo pasan nombres del catálogo sembrado.
  if (rowCount === 0) {
    throw new ErrorDominio(
      `Usuario ${doc} o estado ${nombreEstado} no encontrados`,
      404
    );
  }

  // Respuesta simple para endpoints.
  return { ok: true };
}

// Garantiza que exista un cliente. Se usa al registrar vehículo mensual
// o al crear un ticket con un documento nuevo.
// Acepta un `client` para entrar en la transacción de `crearTicket`: el alta
// del cliente y el ticket son atómicos (si falla el ticket, no queda un
// cliente huérfano creado por un ingreso que nunca ocurrió).
export async function crearClienteSiNoExiste(
  datos: DatosCliente,
  client?: PoolClient
) {
  // Usa transaccion externa si llega; si no, usa pool normal.
  const q = client ?? pool;
  // Busca si el documento ya existe.
  const existente = await obtenerUsuarioConRol(datos.doc, client);

  // Caso 1: existe y no está eliminado.
  if (existente && !existente.eliminado) {
    // Regla: no se puede usar un empleado/gerente como propietario.
    if (existente.role !== "cliente") {
      throw new ErrorDominio("El documento pertenece a un empleado/gerente", 400);
    }

    // Si llega teléfono nuevo, se actualiza (mejora el dato sin bloquear).
    if (datos.telefono) {
      await q.query(
        `UPDATE usuarios SET telefono = $1 WHERE documento = $2`,
        [datos.telefono, datos.doc]
      );
    }

    // Informa que no se creo un usuario nuevo.
    return { usuario: existente, creado: false };
  }

  // Caso 2: existe soft-deleted. Revivir como cliente, no intentar INSERT
  // (chocaría con la PK). Si el documento pertenece a un empleado/gerente
  // eliminado, se rechaza en vez de resucitarlo con un rol equivocado.
  if (existente && existente.eliminado) {
    if (existente.role !== "cliente") {
      throw new ErrorDominio(
        "El documento está reservado a un empleado/gerente eliminado. Contacte al administrador.",
        409
      );
    }

    const { rows } = await q.query(
      `UPDATE usuarios u
       SET fecha_eliminado = NULL,
           estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado='activo' LIMIT 1),
           telefono = COALESCE($2, u.telefono),
           nombre = COALESCE(u.nombre, $3)
       WHERE u.documento = $1
       RETURNING documento, nombre, telefono, correo`,
      [datos.doc, datos.telefono ?? null, datos.nombre ?? `Cliente ${datos.doc}`]
    );

    // Usuario revivido: se considera creado para fines de logica/log.
    return { usuario: rows[0], creado: true };
  }

  // Caso 3: no existe. Se crea como "cliente" con datos mínimos.
  // Contraseña inicial = el propio documento: el cliente puede cambiarla después.
  // El correo sintético usa el TLD reservado .local (RFC 6762) y el prefijo
  // "doc_" para dejar claro que es generado; como `correo` es UNIQUE y el
  // documento lo es, el formato garantiza unicidad.
  // Contrasena inicial del cliente nuevo.
  const hash = await bcrypt.hash(String(datos.doc), 10);
  // Telefono sintetico si no se envio uno.
  const telefono = datos.telefono || `3${String(datos.doc).padStart(9, "0")}`;
  // Correo sintetico unico.
  const correo = datos.correo || `doc_${datos.doc}@parqueadero.local`;
  // Nombre sintetico si no se envio uno.
  const nombre = datos.nombre || `Cliente ${datos.doc}`;

  // Inserta usuario nuevo con rol cliente y estado activo.
  const { rows } = await q.query(
    `INSERT INTO usuarios (
       documento, estados_id_estado, roles_id_roles,
       nombre, telefono, correo, contraseña
     )
     SELECT $1, e.id_estado, r.id_roles, $2, $3, $4, $5
     FROM estados e, roles r
     WHERE e.nombre_estado = 'activo' AND r.nombre_rol = 'cliente'
     RETURNING documento, nombre, telefono, correo`,
    [datos.doc, nombre, telefono, correo, hash]
  );

  // Si no retorno filas, faltan catalogos base.
  if (!rows.length) {
    throw new ErrorDominio("No se pudo crear el cliente. Revisa estados/roles", 500);
  }

  // Informa usuario y que fue creado ahora.
  return { usuario: rows[0], creado: true };
}
