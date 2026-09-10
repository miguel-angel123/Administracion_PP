// Vista administrativa de tarifas (una fila por tarifa real, con tipo de vehículo).
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as tarifasModel from "@/lib/models/tarifas.model";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();

  const tarifas = await tarifasModel.listarTarifasAdmin();

  return NextResponse.json(tarifas);
}
