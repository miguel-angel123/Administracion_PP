import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as vehiculosModel from "@/lib/models/vehiculos.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();

  const vehiculos = await vehiculosModel.listarVehiculos();

  return NextResponse.json(vehiculos);
}

export async function POST(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json(
      { error: "Solo el gerente puede registrar vehículos con contrato mensual" },
      { status: 403 }
    );
  }

  await ensureSeed();

  try {
    const body = await req.json();
    const resultado = await vehiculosModel.registrarVehiculoMensual({
      placa: body.placa,
      doc: body.doc,
      nombre: body.nombre,
      telefono: body.telefono,
      color: body.color,
    });

    const mensaje = resultado.clienteCreado
      ? `Registró vehículo ${resultado.placa} y creó cliente`
      : `Registró vehículo mensual ${resultado.placa}`;

    await registrarLog(sesion.doc, mensaje);

    return NextResponse.json(resultado);
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
