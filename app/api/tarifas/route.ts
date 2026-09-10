// Colección de tarifas. GET es público para cualquier sesión; POST solo gerente.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as tarifasModel from "@/lib/models/tarifas.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";

export async function GET(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();

  const { searchParams } = new URL(req.url);
  // ?recurso=por-tipo → una fila por tarifa real (para la vista del cliente).
  // Sin recurso → vista agregada por modalidad (usada en /estadisticas).
  if (searchParams.get("recurso") === "por-tipo") {
    return NextResponse.json(await tarifasModel.listarTarifasPorTipo());
  }

  const tarifas = await tarifasModel.listarTarifasParaVista();
  return NextResponse.json(tarifas);
}

export async function POST(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Administración de tarifas reservada al gerente.
  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Solo el gerente puede administrar tarifas" }, { status: 403 });
  }

  await ensureSeed();

  try {
    const body = await req.json();
    await tarifasModel.crearTarifa({
      tipoVehiculoId: body.tipoVehiculoId,
      modalidad: body.modalidad,
      valorHora: body.valorHora,
      valorDia: body.valorDia,
      valorMes: body.valorMes,
    });

    await registrarLog(sesion.doc, `Creó tarifa ${body.modalidad} para tipo ${body.tipoVehiculoId}`);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
