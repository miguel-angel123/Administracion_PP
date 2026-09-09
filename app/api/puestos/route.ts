import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { getSesion } from "@/lib/session";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();

  const { rows } = await pool.query(`
    SELECT id_puesto::text AS id, numero_puesto, estado_puesto
    FROM puestos
    WHERE fecha_eliminado IS NULL
    ORDER BY numero_puesto
  `);

  return NextResponse.json(rows);
}
