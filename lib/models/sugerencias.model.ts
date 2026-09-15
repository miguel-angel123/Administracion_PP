// Modelo de sugerencias. Regla de visibilidad: cliente solo ve las suyas;
// gerente/empleado ven todas.
import pool from "@/lib/db";
import { ErrorDominio } from "./errores";

// Catálogo de estados válidos. Debe coincidir con el filtro de la vista
// (app/sugerencias/page.tsx) y con el valor por defecto del INSERT.
const ESTADOS_SUGERENCIA = ["pendiente", "leída"];

// Límite del mensaje. El route ya trunca con limpiarTexto(_, 1000), pero un
// caller directo (script, futura server action) debe ser rechazado en vez de
// guardar silenciosamente un texto más largo.
const MAX_TEXTO = 1000;

// Lista sugerencias. Si esCliente=true se añade el filtro por documento.
// Nota: se construye dinámicamente el WHERE y los parámetros.
// ORDER BY lleva desempate por PK: fecha es TIMESTAMP de segundo y dos filas
// creadas en el mismo segundo alternaban orden entre requests.
export async function listarSugerencias(documentoUsuario?: number, esCliente = false) {
  // Sin documento no hay filtro posible: un cliente vería las sugerencias de
  // todos. Se corta aquí en vez de devolver la lista completa silenciosamente.
  if (esCliente && !documentoUsuario) {
    throw new ErrorDominio(
      "Documento de usuario requerido para listar sugerencias propias",
      400
    );
  }

  const filtro = esCliente ? `WHERE s.usuarios_documento = $1` : "";
  const parametros = esCliente ? [documentoUsuario] : [];

  const { rows } = await pool.query(
    `SELECT
       s.id_sugerencia::text AS id,
       s.usuarios_documento::text AS doc,
       u.nombre AS usuario,
       TO_CHAR(s.fecha, 'DD-MM-YYYY') AS fecha,
       s.mensaje AS texto,
       s.resena AS "reseña",
       COALESCE(s.estado, 'pendiente') AS estado
     FROM sugerencias s
     JOIN usuarios u ON u.documento = s.usuarios_documento
     ${filtro}
     ORDER BY s.fecha DESC, s.id_sugerencia DESC
    `,
    parametros
  );

  return rows;
}

// Crea una sugerencia. Texto obligatorio; reseña entero 0-5.
export async function crearSugerencia(docUsuario: number, texto: string, resena = 0) {
  const textoLimpio = String(texto || "").trim();
  if (!textoLimpio) {
    throw new ErrorDominio("El texto es obligatorio", 400);
  }
  if (textoLimpio.length > MAX_TEXTO) {
    throw new ErrorDominio(`El texto no puede superar ${MAX_TEXTO} caracteres`, 400);
  }

  // Number() antes del check: un "3" de un form viaja como string y
  // Number.isInteger lo rechazaría sin la conversión.
  const numResena = Number(resena) || 0;
  if (!Number.isInteger(numResena) || numResena < 0 || numResena > 5) {
    throw new ErrorDominio("La reseña debe ser un entero entre 0 y 5", 400);
  }

  const { rows } = await pool.query(
    `INSERT INTO sugerencias (usuarios_documento, mensaje, resena, estado)
     VALUES ($1, $2, $3, $4)
     RETURNING id_sugerencia AS id`,
    [docUsuario, textoLimpio, numResena, ESTADOS_SUGERENCIA[0]]
  );

  return rows[0];
}

// Cambia el estado (pendiente → leída). Retorna 404 si no existe.
export async function actualizarEstadoSugerencia(id: number, estado: string) {
  if (!ESTADOS_SUGERENCIA.includes(estado)) {
    throw new ErrorDominio("Estado no permitido", 400);
  }

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
