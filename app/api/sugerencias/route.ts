// Sugerencias: GET (cliente ve solo las suyas), POST (cualquiera con sesión).
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as sugerenciasModel from "@/lib/models/sugerencias.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";
import { limpiarTexto } from "@/lib/sanitizar";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();

  const esCliente = sesion.role === "cliente";
  const docCliente = esCliente ? Number(sesion.doc) : undefined;

  const sugerencias = await sugerenciasModel.listarSugerencias(docCliente, esCliente);

  return NextResponse.json(sugerencias);
}

export async function POST(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();

  try {
    const body = await req.json();
    const texto = limpiarTexto(body.texto, 1000);
    const resena = Math.min(5, Math.max(0, Number(body.resena) || 0));

    const resultado = await sugerenciasModel.crearSugerencia(Number(sesion.doc), texto, resena);

    await registrarLog(sesion.doc, "Envió una sugerencia");

    return NextResponse.json({ ok: true, id: resultado.id });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
