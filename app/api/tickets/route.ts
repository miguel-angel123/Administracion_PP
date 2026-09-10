// Colección de tickets. GET lista (paginado); POST crea un ticket diario (gerente o empleado).
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as ticketsModel from "@/lib/models/tickets.model";
import { ErrorDominio } from "@/lib/models/errores";
import { limpiarPlaca, limpiarDocumento, limpiarTelefono } from "@/lib/sanitizar";

export async function GET(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();

  const { searchParams } = new URL(req.url);

  // Respuesta paginada: { datos, total, pagina, tamano, totalPaginas }.
  const resultado = await ticketsModel.listarTickets({
    pagina: Number(searchParams.get("pagina") || 1),
    tamano: Number(searchParams.get("tamano") || 20),
    buscar: searchParams.get("buscar") || undefined,
    orden: (searchParams.get("orden") as
      | "id"
      | "placa"
      | "propietario"
      | "entrada"
      | "estado"
      | null) || undefined,
    dir: (searchParams.get("dir") as "asc" | "desc" | null) || undefined,
  });

  return NextResponse.json(resultado);
}

export async function POST(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente" && sesion.role !== "empleado") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();

  const body = await req.json();

  try {
    const resultado = await ticketsModel.crearTicket({
      placa: limpiarPlaca(body.placa),
      doc_propietario: limpiarDocumento(body.doc_propietario) || undefined,
      telefono: limpiarTelefono(body.telefono) || undefined,
      puestos_id_puesto: body.puestos_id_puesto,
      operadorDoc: sesion.doc,
    });

    return NextResponse.json(resultado);
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
