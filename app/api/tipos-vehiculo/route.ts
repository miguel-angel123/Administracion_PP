import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import pool from "@/lib/db";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();

  const { rows } = await pool.query(
    `SELECT id_tipo_vehiculo::text AS id, nombre, icono
     FROM tipos_vehiculo
     WHERE fecha_eliminado IS NULL
     ORDER BY id_tipo_vehiculo`
  );

  return NextResponse.json(rows);
}
