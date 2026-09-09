import pool from "@/lib/db";
import { ErrorDominio } from "./errores";

export async function listarSugerencias(documentoUsuario?: number, esCliente = false) {
  const filtro = esCliente && documentoUsuario ? `WHERE s.usuarios_documento = $1` : "";
  const parametros = esCliente && documentoUsuario ? [documentoUsuario] : [];

  const { rows } = await pool.query(
    `SELECT
       s.id_sugerencia::text AS id,
       u.nombre AS usuario,
       TO_CHAR(s.fecha, 'YYYY-MM-DD') AS fecha,
       s.mensaje AS texto,
       s.resena AS "reseña",
       COALESCE(s.estado, 'pendiente') AS estado
     FROM sugerencias s
     JOIN usuarios u ON u.documento = s.usuarios_documento
     ${filtro}
     ORDER BY s.fecha DESC
    `,
    parametros
  );

  return rows;
}

export async function crearSugerencia(docUsuario: number, texto: string, resena = 0) {
  if (!texto || !texto.trim()) {
    throw new ErrorDominio("El texto es obligatorio", 400);
  }

  const { rows } = await pool.query(
    `INSERT INTO sugerencias (usuarios_documento, mensaje, resena, estado)
     VALUES ($1, $2, $3, 'pendiente')
     RETURNING id_sugerencia AS id`,
    [docUsuario, texto, resena || 0]
  );

  return rows[0];
}

export async function actualizarEstadoSugerencia(id: number, estado: string) {
  const { rows } = await pool.query(
    `UPDATE sugerencias
     SET estado = $1
     WHERE id_sugerencia = $2
     RETURNING id_sugerencia AS id`,
    [estado, id]
  );

  if (!rows.length) {
    throw new ErrorDominio("Sugerencia no encontrada", 404);
  }

  return rows[0];
}
