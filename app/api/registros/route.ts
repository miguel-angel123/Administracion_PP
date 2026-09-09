import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as registrosModel from "@/lib/models/registros.model";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();

  const registros = await registrosModel.listarRegistros();

  return NextResponse.json(registros);
}
