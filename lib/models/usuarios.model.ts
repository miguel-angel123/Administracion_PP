// Modelo de usuarios: empleados, clientes y alta automática.
// Reglas de rol y manejo de contraseñas viven aquí.
import type { PoolClient } from "pg";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { ErrorDominio } from "./errores";

// Contratos de entrada.
export interface DatosEmpleado {
  doc: number;
  nombre: string;
  cargo?: string;
  telefono?: string;
  correo?: string;
  password?: string;
  estado?: string;
}

export interface DatosCliente {
  doc: number;
  nombre?: string;
  telefono?: string;
  correo?: string;
}

interface OpcionesListado {
  pagina?: number;
  tamano?: number;
  buscar?: string;
  orden?: "nombre" | "cargo" | "documento";
  dir?: "asc" | "desc";
}

// bcrypt cost 10 tarda ~80 ms. Reusar el mismo hash para la contraseña de
// fallback ("123456") evita gastar CPU en cada update de empleado sin password.
// No es regresión de seguridad: todos esos usuarios ya comparten la misma
// password por diseño; el hash bcrypt incluye su propio salt.
let hashFallbackPromise: Promise<string> | null = null;
function getHashFallback() {
  if (!hashFallbackPromise) hashFallbackPromise = bcrypt.hash("123456", 10);
  return hashFallbackPromise;
}

// Lista usuarios por nombre de rol con paginación y orden server-side.
// Excluye soft-deleted.
export async function listarUsuariosPorRol(rol: string, opts: OpcionesListado = {}) {
  const pagina = Math.max(1, opts.pagina || 1);
  const tamano = Math.min(100, Math.max(1, opts.tamano || 20));
  const offset = (pagina - 1) * tamano;

  const filtros: string[] = ["r.nombre_rol = $1", "u.fecha_eliminado IS NULL"];
  const params: unknown[] = [rol];

  if (opts.buscar && opts.buscar.trim()) {
    params.push(`%${opts.buscar.trim()}%`);
    const idx = params.length;
    filtros.push(`(u.nombre ILIKE $${idx} OR u.documento::text ILIKE $${idx})`);
  }

  const where = "WHERE " + filtros.join(" AND ");

  const cols: Record<string, string> = {
    nombre: "u.nombre",
    cargo: "COALESCE(u.cargo, '')",
    documento: "u.documento",
  };
  const col = cols[opts.orden || "nombre"] || "u.nombre";
  const dir = opts.dir === "desc" ? "DESC" : "ASC";

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
    datos: rows,
    total: total.rows[0].total,
    pagina,
    tamano,
    totalPaginas: Math.max(1, Math.ceil(total.rows[0].total / tamano)),
  };
}

// Devuelve el usuario con rol y estado, incluyendo si está eliminado.
// Usado antes de crear/actualizar y para validar propietarios.
// Acepta un `client` (transacción abierta por el llamador) para que la lectura
// vea el estado no confirmado de la propia transacción.
export async function obtenerUsuarioConRol(doc: number, client?: PoolClient) {
  const q = client ?? pool;
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
  const passwordProvided =
    typeof datos.password === "string" && datos.password.length > 0;
  const hash = passwordProvided
    ? await bcrypt.hash(datos.password as string, 10)
    : await getHashFallback();

  let estadoId: number | null = null;
  let fechaEliminado: Date | null = null;

  if (datos.estado) {
    const er = await pool.query(
      `SELECT id_estado FROM estados WHERE nombre_estado = $1 LIMIT 1`,
      [datos.estado]
    );
    if (!er.rows.length) {
      throw new ErrorDominio(`Estado ${datos.estado} no existe`, 400);
    }
    estadoId = er.rows[0].id_estado;
    fechaEliminado = datos.estado === "inactivo" ? new Date() : null;
  }

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
      datos.nombre,
      datos.telefono || "",
      datos.correo || "",
      hash,
      datos.cargo || null,
      estadoId,
      fechaEliminado,
      passwordProvided,
    ]
  );

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
  const sets: string[] = [];
  const values: unknown[] = [];

  if (cambios.nombre !== undefined) {
    values.push(cambios.nombre);
    sets.push(`nombre = $${values.length}`);
  }

  if (cambios.cargo !== undefined) {
    values.push(cambios.cargo);
    sets.push(`cargo = $${values.length}`);
  }

  if (cambios.telefono !== undefined) {
    values.push(cambios.telefono);
    sets.push(`telefono = $${values.length}`);
  }

  if (cambios.correo !== undefined) {
    values.push(cambios.correo);
    sets.push(`correo = $${values.length}`);
  }

  if (cambios.password) {
    const hash = await bcrypt.hash(cambios.password, 10);
    values.push(hash);
    sets.push(`contraseña = $${values.length}`);
  }

  if (cambios.estado) {
    const er = await pool.query(
      `SELECT id_estado FROM estados WHERE nombre_estado = $1 LIMIT 1`,
      [cambios.estado]
    );
    if (!er.rows.length) {
      throw new ErrorDominio(`Estado ${cambios.estado} no existe`, 400);
    }
    values.push(er.rows[0].id_estado);
    sets.push(`estados_id_estado = $${values.length}`);
    values.push(cambios.estado === "inactivo" ? new Date() : null);
    sets.push(`fecha_eliminado = $${values.length}`);
  }

  if (!sets.length) {
    throw new ErrorDominio("No hay campos para actualizar", 400);
  }

  // RETURNING convierte el UPDATE en su propio chequeo de existencia: si el
  // documento no está, no hay fila devuelta. Antes el llamador debía asumir
  // éxito sin señal alguna.
  values.push(doc);
  const { rows } = await pool.query(
    `UPDATE usuarios SET ${sets.join(", ")}
     WHERE documento = $${values.length}
     RETURNING documento`,
    values
  );

  if (!rows.length) {
    throw new ErrorDominio("Usuario no encontrado", 404);
  }

  return { ok: true };
}

// Cambia el estado del usuario por nombre ("activo", "trabajando", "descansando", "inactivo").
// Regla: "inactivo" implica soft delete (fecha_eliminado); el resto limpia esa fecha.
// Un solo statement: el id del estado se resuelve en el FROM estados y la fecha
// se decide por CASE, sin un SELECT previo.
export async function cambiarEstadoPorNombre(doc: number, nombreEstado: string) {
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
  const q = client ?? pool;
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

    return { usuario: rows[0], creado: true };
  }

  // Caso 3: no existe. Se crea como "cliente" con datos mínimos.
  // Contraseña inicial = el propio documento: el cliente puede cambiarla después.
  // El correo sintético usa el TLD reservado .local (RFC 6762) y el prefijo
  // "doc_" para dejar claro que es generado; como `correo` es UNIQUE y el
  // documento lo es, el formato garantiza unicidad.
  const hash = await bcrypt.hash(String(datos.doc), 10);
  const telefono = datos.telefono || `3${String(datos.doc).padStart(9, "0")}`;
  const correo = datos.correo || `doc_${datos.doc}@parqueadero.local`;
  const nombre = datos.nombre || `Cliente ${datos.doc}`;

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

  if (!rows.length) {
    throw new ErrorDominio("No se pudo crear el cliente. Revisa estados/roles", 500);
  }

  return { usuario: rows[0], creado: true };
}
