// Escritura de logs de auditoría. Se invoca después de operaciones relevantes.
import pool from "@/lib/db";

export async function registrarLog(idUsuario: string | number, accion: string) {
  try {
    // Se guarda el documento del autor y un texto descriptivo de la acción.
    // La clasificación (LOGIN / CREATE / EDIT / INACTIVE / TICKET) se hace al leer, en registros.model.
    await pool.query(
      `INSERT INTO logs_sistema (usuarios_documento, accion) VALUES ($1, $2)`,
      [Number(idUsuario), accion]
    );
  } catch {
    // Los logs son secundarios: si fallan no deben romper la operación principal.
  }
}
