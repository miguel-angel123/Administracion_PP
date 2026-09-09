import pool from "@/lib/db";

export async function registrarLog(idUsuario: string | number, accion: string) {
  try {
    await pool.query(
      `INSERT INTO logs_sistema (usuarios_documento, accion) VALUES ($1, $2)`,
      [Number(idUsuario), accion]
    );
  } catch {
    // No romper la operación principal si falla el log
  }
}
