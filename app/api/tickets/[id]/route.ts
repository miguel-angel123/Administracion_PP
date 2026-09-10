// Cierre (PATCH), finalización (DELETE) y consulta de impresión (GET) de un ticket.
// Mutaciones: solo personal operativo.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as ticketsModel from "@/lib/models/tickets.model";
import { ErrorDominio } from "@/lib/models/errores";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();
  const { id } = await params;

  const ticket = await ticketsModel.obtenerTicketParaImpresion(id);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  return NextResponse.json(ticket);
}

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente" && sesion.role !== "empleado") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();
  const { id } = await params;

  try {
    // El modelo calcula el valor total según horas transcurridas y libera el puesto.
    // El documento del operador queda reflejado en el log.
    const resultado = await ticketsModel.cerrarTicket(id, sesion.doc);
    return NextResponse.json(resultado);
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

  if (sesion.role !== "gerente" && sesion.role !== "empleado") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();
  const { id } = await params;

  try {
    // Finalización: marca el ticket como finalizado, inactiva el vehículo
    // asociado y libera el puesto ocupado.
    await ticketsModel.finalizarTicket(id, sesion.doc);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
