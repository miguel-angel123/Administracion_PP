// Marca una sugerencia como leída. Cliente no puede cambiar estados.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as sugerenciasModel from "@/lib/models/sugerencias.model";
import { respuestaError } from "@/lib/erroresHttp";
import { registrarLog } from "@/lib/log";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Solo personal interno puede marcar sugerencias como atendidas.
    if (sesion.role === "cliente") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    await ensureSeed();
    const { id } = await params;
    const { estado } = await req.json();

    await sugerenciasModel.actualizarEstadoSugerencia(Number(id), estado);
    await registrarLog(sesion.doc, `Marcó sugerencia ${id} como ${estado}`);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaError(e);
  }
}
