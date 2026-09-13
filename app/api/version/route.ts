// Sondeo liviano: 1 SELECT sobre 1 fila. Es lo único que golpea periódicamente
// la BD desde el frontend; los endpoints pesados solo se llaman cuando cambia.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import pool from "@/lib/db";
import { respuestaError } from "@/lib/erroresHttp";

export async function GET() {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let version = 0;
    try {
      const { rows } = await pool.query(
        `SELECT version FROM sistema_version WHERE id = TRUE`
      );
      version = Number(rows[0]?.version ?? 0);
    } catch (e) {
      // 42P01 = tabla inexistente. Ocurre en los primeros cientos de ms
      // hasta que ensureSeed() corra desde otro endpoint. Devolver 0 evita
      // el 500 en consola; el polling sigue consultando y en cuanto la tabla
      // exista la primera diferencia (0 → N) dispara el refetch normal.
      if ((e as { code?: string }).code !== "42P01") throw e;
    }

    // no-store: la respuesta ES la señal. Cualquier caché la inutiliza.
    return NextResponse.json(
      { version },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return respuestaError(e);
  }
}
