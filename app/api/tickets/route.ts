import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as ticketsModel from "@/lib/models/tickets.model";
import { ErrorDominio } from "@/lib/models/errores";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();

  const tickets = await ticketsModel.listarTickets();

  return NextResponse.json(tickets);
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
      ...body,
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
