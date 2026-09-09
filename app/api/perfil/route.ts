import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import * as perfilModel from "@/lib/models/perfil.model";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const [vehiculos, historial] = await Promise.all([
    perfilModel.obtenerVehiculosDeCliente(Number(sesion.doc)),
    perfilModel.obtenerHistorialCliente(Number(sesion.doc)),
  ]);

  return NextResponse.json({
    nombre: sesion.name,
    doc: sesion.doc,
    role: sesion.role,
    email: sesion.email,
    telefono: sesion.phone,
    vehiculos,
    historial,
  });
}
