import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { ErrorDominio } from "./errores";

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

export async function listarUsuariosPorRol(rol: string) {
  const { rows } = await pool.query(
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
     WHERE r.nombre_rol = $1
       AND u.fecha_eliminado IS NULL
     ORDER BY u.nombre`,
    [rol]
  );

  return rows;
}

export async function obtenerUsuarioConRol(doc: number) {
  const { rows } = await pool.query(
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

export async function crearEmpleado(datos: DatosEmpleado) {
  const hash = await bcrypt.hash(datos.password || "123456", 10);

  const { rows } = await pool.query(
    `INSERT INTO usuarios (
       documento, estados_id_estado, roles_id_roles,
       nombre, fecha_nacimiento, telefono, correo,
       genero, contraseña, cargo
     )
     SELECT $1, e.id_estado, r.id_roles, $2, '2000-01-01', $3, $4, 'Masculino', $5, $6
     FROM estados e, roles r
     WHERE e.nombre_estado = 'activo' AND r.nombre_rol = 'empleado'
     ON CONFLICT (documento) DO UPDATE SET
       nombre = EXCLUDED.nombre,
       cargo = EXCLUDED.cargo,
       telefono = EXCLUDED.telefono,
       correo = EXCLUDED.correo,
       contraseña = EXCLUDED.contraseña
     RETURNING documento AS doc`,
    [
      datos.doc,
      datos.nombre,
      datos.telefono || "",
      datos.correo || "",
      hash,
      datos.cargo || null,
    ]
  );

  if (datos.estado) {
    await cambiarEstadoPorNombre(datos.doc, datos.estado);
  }

  return rows[0];
}

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

  if (!sets.length) {
    throw new ErrorDominio("No hay campos para actualizar", 400);
  }

  values.push(doc);
  await pool.query(
    `UPDATE usuarios SET ${sets.join(", ")} WHERE documento = $${values.length}`,
    values
  );

  if (cambios.estado) {
    await cambiarEstadoPorNombre(doc, cambios.estado);
  }

  return { ok: true };
}

export async function cambiarEstadoPorNombre(doc: number, nombreEstado: string) {
  const { rows } = await pool.query(
    `SELECT id_estado
     FROM estados
     WHERE nombre_estado = $1
     LIMIT 1`,
    [nombreEstado]
  );

  if (!rows.length) {
    throw new ErrorDominio(`Estado ${nombreEstado} no existe`, 400);
  }

  const idEstado = rows[0].id_estado;
  const esInactivo = nombreEstado === "inactivo";
  const fechaEliminado = esInactivo ? new Date() : null;

  await pool.query(
    `UPDATE usuarios
     SET estados_id_estado = $2,
         fecha_eliminado = $3
     WHERE documento = $1`,
    [doc, idEstado, fechaEliminado]
  );

  return { ok: true };
}

export async function crearClienteSiNoExiste(datos: DatosCliente) {
  const existente = await obtenerUsuarioConRol(datos.doc);

  if (existente && !existente.eliminado) {
    if (existente.role !== "cliente") {
      throw new ErrorDominio("El documento pertenece a un empleado/gerente", 400);
    }

    if (datos.telefono) {
      await pool.query(
        `UPDATE usuarios SET telefono = $1 WHERE documento = $2`,
        [datos.telefono, datos.doc]
      );
    }

    return { usuario: existente, creado: false };
  }

  const hash = await bcrypt.hash(String(datos.doc), 10);
  const telefono = datos.telefono || `3${String(datos.doc).padStart(9, "0")}`;
  const correo = datos.correo || `${datos.doc}@parqueadero.generado`;
  const nombre = datos.nombre || `Cliente ${datos.doc}`;

  const { rows } = await pool.query(
    `INSERT INTO usuarios (
       documento, estados_id_estado, roles_id_roles,
       nombre, fecha_nacimiento, telefono, correo,
       genero, contraseña
     )
     SELECT $1, e.id_estado, r.id_roles, $2, '2000-01-01', $3, $4, 'otro', $5
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
