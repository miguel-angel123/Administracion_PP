import { cookies } from "next/headers";
import pool from "@/lib/db";
import { verificarToken } from "@/lib/jwt";

export interface Sesion {
  doc: string;
  role: string;
  name: string;
  email: string;
  phone: string;
  estado: string;
}

export async function getSesion(): Promise<Sesion | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const payload = await verificarToken(token);
  if (!payload) return null;

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

  if (!rows.length) return null;

  return {
    doc: rows[0].doc,
    role: rows[0].role,
    name: rows[0].nombre,
    email: rows[0].correo,
    phone: rows[0].telefono,
    estado: rows[0].estado,
  };
}
