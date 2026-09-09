import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as vehiculosModel from "@/lib/models/vehiculos.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ placa: string }> }
) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();
  const { placa } = await params;
  const body = await req.json();

  try {
    if (body.estado) {
      await vehiculosModel.actualizarEstadoVehiculo(placa, body.estado);
      await registrarLog(sesion.doc, `Cambió estado del vehículo ${placa} a ${body.estado}`);
    }

    if (body.color) {
      await vehiculosModel.actualizarColorVehiculo(placa, body.color);
      await registrarLog(sesion.doc, `Actualizó color del vehículo ${placa}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ placa: string }> }
) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();
  const { placa } = await params;

  try {
    await vehiculosModel.eliminarVehiculoSoft(placa);
    await registrarLog(sesion.doc, `Eliminó vehículo ${placa}`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
