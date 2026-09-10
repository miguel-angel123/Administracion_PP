// Edición y borrado lógico de una tarifa específica. Solo gerente.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as tarifasModel from "@/lib/models/tarifas.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Solo el gerente puede editar tarifas" }, { status: 403 });
  }

  await ensureSeed();
  const { id } = await params;

  try {
    const body = await req.json();
    // El modelo valida modalidad, tipo de vehículo y aplica solo los campos presentes.
    await tarifasModel.actualizarTarifa(Number(id), {
      tipoVehiculoId: body.tipoVehiculoId,
      modalidad: body.modalidad,
      valorHora: body.valorHora,
      valorDia: body.valorDia,
      valorMes: body.valorMes,
    });

    await registrarLog(sesion.doc, `Editó tarifa ${id}`);

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
  { params }: { params: Promise<{ id: string }> }
) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Solo el gerente puede eliminar tarifas" }, { status: 403 });
  }

  await ensureSeed();
  const { id } = await params;

  try {
    // Soft delete: la tarifa deja de ser visible pero se conserva para reportes históricos.
    await tarifasModel.eliminarTarifa(Number(id));
    await registrarLog(sesion.doc, `Eliminó tarifa ${id}`);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
