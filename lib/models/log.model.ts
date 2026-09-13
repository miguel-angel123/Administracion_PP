// Escritura de logs de auditoría. Se invoca después de operaciones relevantes.
import pool from "@/lib/db";

export async function registrarLog(idUsuario: string | number, accion: string) {
  try {
    // Number() de un doc no numérico da NaN y pg lo manda como literal 'NaN',
    // que el INSERT rechaza contra un INTEGER. Se normaliza a null.
    const docNum = Number(idUsuario);
    const doc = Number.isFinite(docNum) ? docNum : null;

    // La columna es VARCHAR(255). Un mensaje compuesto con nombre, placa o
    // descripción larga rebasa el tope, y Postgres aborta con 22001 que el catch
    // de abajo silencia: el log se perdería sin rastro. Se trunca en el origen.
    const accionLimpia = String(accion || "").slice(0, 255);

    await pool.query(
      `INSERT INTO logs_sistema (usuarios_documento, accion) VALUES ($1, $2)`,
      [doc, accionLimpia]
    );
  } catch (e) {
    // Los logs son secundarios: si fallan no deben romper la operación principal.
    // En dev se deja rastro para no perder el INSERT en silencio.
    if (process.env.NODE_ENV !== "production") {
      console.error("[auditoría] error al registrar log:", e);
    }
  }
}
