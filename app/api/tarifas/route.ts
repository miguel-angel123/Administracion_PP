// Colección de tarifas. GET es público para cualquier sesión; POST solo gerente.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as tarifasModel from "@/lib/models/tarifas.model";
import { respuestaError } from "@/lib/erroresHttp";
import { registrarLog } from "@/lib/log";

export async function GET() {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await ensureSeed();

    // Única forma de listado: una fila por tarifa real (modalidad × tipo).
    // La vista agregada por modalidad se eliminó junto con listarTarifasParaVista.
    return NextResponse.json(await tarifasModel.listarTarifasPorTipo());
  } catch (e) {
    return respuestaError(e);
  }
}

export async function POST(req: Request) {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Administración de tarifas reservada al gerente.
    if (sesion.role !== "gerente") {
      return NextResponse.json(
        { error: "Solo el gerente puede administrar tarifas" },
        { status: 403 }
      );
    }

    await ensureSeed();

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
  } catch (e) {
    return respuestaError(e);
  }
}
