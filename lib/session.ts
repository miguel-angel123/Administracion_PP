// Recupera la sesión del usuario desde la cookie httpOnly y refresca sus datos
// contra la base de datos. Es la única fuente de verdad de "quién es quién" en el backend.
import { cookies } from "next/headers";
import pool from "@/lib/db";
import { verificarToken } from "@/lib/jwt";

// Contrato que consumen todos los controladores.
export interface Sesion {
  doc: string;
  role: string;
  name: string;
  email: string;
  phone: string;
  estado: string;
}

// Caché por proceso: doc → { sesión, expira }.
// Evita golpear la BD en cada endpoint (que antes sumaba un SELECT × N requests).
// El JWT ya trae doc y role firmados; en 60 s es raro que cambien.
// Trade-off: un usuario inactivado o con rol cambiado mantiene su sesión
// hasta la siguiente revalidación (máx. 60 s), no las 8 h del token.
const cacheSesion = new Map<string, { sesion: Sesion; expira: number }>();
const TTL_MS = 60_000;

export async function getSesion(): Promise<Sesion | null> {
  // 1. Lee la cookie "token". Si no existe, no hay sesión posible.
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  // 2. Verifica firma y expiración del JWT.
  const payload = await verificarToken(token);
  if (!payload) return null;

  // 3. Caché: golpea la BD como mucho una vez por minuto por usuario.
  const cacheado = cacheSesion.get(payload.doc);
  if (cacheado && cacheado.expira > Date.now()) {
    return cacheado.sesion;
  }

  // 4. Refresca los datos del usuario desde la BD. Se filtra:
  //    fecha_eliminado IS NULL  → descarta usuarios con soft delete.
  //    nombre_estado <> 'inactivo' → permite 'activo', 'trabajando', 'descansando',
  //      así los empleados no pierden la sesión al cambiar de estado.
  const { rows } = await pool.query(
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
    [Number(payload.doc)]
  );

  if (!rows.length) {
    // Token válido pero el usuario fue inactivado / borrado: limpia la caché.
    cacheSesion.delete(payload.doc);
    return null;
  }

  const sesion: Sesion = {
    doc: rows[0].doc,
    role: rows[0].role,
    name: rows[0].nombre,
    email: rows[0].correo,
    phone: rows[0].telefono,
    estado: rows[0].estado,
  };

  cacheSesion.set(payload.doc, { sesion, expira: Date.now() + TTL_MS });
  return sesion;
}
