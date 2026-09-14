// Recupera la sesión del usuario desde la cookie httpOnly y refresca sus datos
// contra la base de datos. Es la única fuente de verdad de "quién es quién" en el backend.
// cookies permite leer cookies desde Server Components y Route Handlers.
import { cookies } from "next/headers";
// pool es la conexion compartida a PostgreSQL.
import pool from "@/lib/db";
// verificarToken valida el JWT antes de confiar en sus datos.
import { verificarToken } from "@/lib/jwt";

// Contrato que consumen todos los controladores.
export interface Sesion {
  // Documento del usuario como texto.
  doc: string;
  // Rol usado para permisos.
  role: string;
  // Nombre visible.
  name: string;
  // Correo registrado.
  email: string;
  // Telefono registrado.
  phone: string;
  // Estado actual en base de datos.
  estado: string;
}

// Caché por proceso: doc → { sesión, expira }.
// Evita golpear la BD en cada endpoint (que antes sumaba un SELECT × N requests).
// El JWT ya trae doc y role firmados; en 60 s es raro que cambien.
// Trade-off: un usuario inactivado o con rol cambiado mantiene su sesión
// hasta la siguiente revalidación (máx. 60 s), no las 8 h del token.
const cacheSesion = new Map<string, { sesion: Sesion; expira: number }>();
// Tiempo maximo que una sesion puede vivir en cache antes de consultar la BD.
const TTL_MS = 60_000;

// Funcion central del backend para saber quien esta haciendo la peticion.
export async function getSesion(): Promise<Sesion | null> {
  // 1. Lee la cookie "token". Si no existe, no hay sesión posible.
  // cookies() devuelve el almacen de cookies de la peticion actual.
  const cookieStore = await cookies();
  // Extrae el valor de la cookie httpOnly creada en login.
  const token = cookieStore.get("token")?.value;
  // Sin token no hay sesion.
  if (!token) return null;

  // 2. Verifica firma y expiración del JWT.
  // payload contiene doc y role si el token es valido.
  const payload = await verificarToken(token);
  // Token invalido o expirado: sesion nula.
  if (!payload) return null;

  // 3. Caché: golpea la BD como mucho una vez por minuto por usuario.
  const cacheado = cacheSesion.get(payload.doc);
  // Si existe cache vigente, evita una consulta SQL.
  if (cacheado && cacheado.expira > Date.now()) {
    return cacheado.sesion;
  }

  // 4. Refresca los datos del usuario desde la BD. Se filtra:
  //    fecha_eliminado IS NULL  → descarta usuarios con soft delete.
  //    nombre_estado <> 'inactivo' → permite 'activo', 'trabajando', 'descansando',
  //      así los empleados no pierden la sesión al cambiar de estado.
  const { rows } = await pool.query(
    // Selecciona datos publicos y une roles/estados para obtener nombres legibles.
    `SELECT
       u.documento::text AS doc,
       u.nombre,
       u.correo,
       u.telefono,
       r.nombre_rol AS role,
       e.nombre_estado AS estado
     FROM usuarios u
     JOIN roles r ON r.id_roles = u.roles_id_roles
     JOIN estados e ON e.id_estado = u.estados_id_estado
     WHERE u.documento = $1
       AND u.fecha_eliminado IS NULL
       AND e.nombre_estado <> 'inactivo'`,
    // Parametro seguro; evita concatenar SQL manualmente.
    [Number(payload.doc)]
  );

  // Si no hay filas, el token era valido pero el usuario ya no esta habilitado.
  if (!rows.length) {
    // Token válido pero el usuario fue inactivado / borrado: limpia la caché.
    cacheSesion.delete(payload.doc);
    return null;
  }

  const sesion: Sesion = {
    // Documento devuelto por SQL como texto.
    doc: rows[0].doc,
    // Rol normalizado desde la tabla roles.
    role: rows[0].role,
    // Nombre desde usuarios.
    name: rows[0].nombre,
    // Correo desde usuarios.
    email: rows[0].correo,
    // Telefono desde usuarios.
    phone: rows[0].telefono,
    // Estado desde tabla estados.
    estado: rows[0].estado,
  };

  // Guarda la sesion en cache por 60 segundos.
  cacheSesion.set(payload.doc, { sesion, expira: Date.now() + TTL_MS });
  // Devuelve la sesion al endpoint que la pidio.
  return sesion;
}
