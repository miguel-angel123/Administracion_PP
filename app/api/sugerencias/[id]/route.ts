import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as sugerenciasModel from "@/lib/models/sugerencias.model";
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

  if (sesion.role === "cliente") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();
  const { id } = await params;
  const { estado } = await req.json();

  try {
    await sugerenciasModel.actualizarEstadoSugerencia(Number(id), estado);
    await registrarLog(sesion.doc, `Marcó sugerencia ${id} como ${estado}`);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
