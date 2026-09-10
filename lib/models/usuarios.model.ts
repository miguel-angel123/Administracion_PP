// Modelo de usuarios: empleados, clientes y alta automática.
// Reglas de rol y manejo de contraseñas viven aquí.
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

  const total = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM usuarios u
     JOIN roles r ON r.id_roles = u.roles_id_roles
     ${where}`,
    params
  );

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

// Devuelve el usuario con rol y estado, incluyendo si está eliminado.
// Usado antes de crear/actualizar y para validar propietarios.
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

// Crea o actualiza un empleado. Hashea la contraseña y fuerza rol "empleado".
// ON CONFLICT permite reusar la función para "upsert".
export async function crearEmpleado(datos: DatosEmpleado) {
  const hash = await bcrypt.hash(datos.password || "123456", 10);

  const { rows } = await pool.query(
    `INSERT INTO usuarios (
       documento, estados_id_estado, roles_id_roles,
       nombre, telefono, correo, contraseña, cargo
     )
     SELECT $1, e.id_estado, r.id_roles, $2, $3, $4, $5, $6
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

// Actualiza parcialmente. Solo escribe los campos definitivamente presentes.
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

  // El estado se trata aparte porque involucra cambiar fecha_eliminado.
  if (cambios.estado) {
    await cambiarEstadoPorNombre(doc, cambios.estado);
  }

  return { ok: true };
}

// Cambia el estado del usuario por nombre ("activo", "trabajando", "descansando", "inactivo").
// Regla: "inactivo" implica soft delete (fecha_eliminado); el resto limpia esa fecha.
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

// Garantiza que exista un cliente. Se usa al registrar vehículo mensual
// o al crear un ticket con un documento nuevo.
export async function crearClienteSiNoExiste(datos: DatosCliente) {
  const existente = await obtenerUsuarioConRol(datos.doc);

  // Caso 1: existe y no está eliminado.
  if (existente && !existente.eliminado) {
    // Regla: no se puede usar un empleado/gerente como propietario.
    if (existente.role !== "cliente") {
      throw new ErrorDominio("El documento pertenece a un empleado/gerente", 400);
    }

    // Si llega teléfono nuevo, se actualiza (mejora el dato sin bloquear).
    if (datos.telefono) {
      await pool.query(
        `UPDATE usuarios SET telefono = $1 WHERE documento = $2`,
        [datos.telefono, datos.doc]
      );
    }

    return { usuario: existente, creado: false };
  }

  // Caso 2: no existe (o está soft-deleted). Se crea como "cliente" con datos mínimos.
  // Contraseña inicial = el propio documento: el cliente puede cambiarla después.
  const hash = await bcrypt.hash(String(datos.doc), 10);
  const telefono = datos.telefono || `3${String(datos.doc).padStart(9, "0")}`;
  const correo = datos.correo || `${datos.doc}@parqueadero.generado`;
  const nombre = datos.nombre || `Cliente ${datos.doc}`;

  const { rows } = await pool.query(
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
