// Consulta (GET), cierre (POST), edición (PATCH) y finalización (DELETE) de un ticket.
// Cierre y finalización: personal operativo. Edición: sólo gerente.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as ticketsModel from "@/lib/models/tickets.model";
import { respuestaError } from "@/lib/erroresHttp";
import { limpiarTexto, limpiarTelefono } from "@/lib/sanitizar";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // El detalle de un ticket incluye placa, documento, teléfono y puesto:
    // un cliente con la URL directa podía leer cualquier ticket ajeno.
    if (sesion.role !== "gerente" && sesion.role !== "empleado") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    await ensureSeed();
    const { id } = await params;

    const ticket = await ticketsModel.obtenerTicketParaImpresion(id);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    }

    return NextResponse.json(ticket);
  } catch (e) {
    return respuestaError(e);
  }
}

// Cierre / cobro. Antes era PATCH; se movió a POST para liberar PATCH para la
// edición administrativa. La semántica no cambia: aplicar acción "cerrar".
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (sesion.role !== "gerente" && sesion.role !== "empleado") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    await ensureSeed();
    const { id } = await params;

    // El modelo calcula el valor total según horas transcurridas y libera el puesto.
    // El documento del operador queda reflejado en el log.
    const resultado = await ticketsModel.cerrarTicket(id, sesion.doc);
    return NextResponse.json(resultado);
  } catch (e) {
    return respuestaError(e);
  }
}

// Edición de un ticket activo. Reservada al gerente: corregir dueño o tipo
// impacta el cobro siguiente, así que no puede ser una acción operativa.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (sesion.role !== "gerente") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    await ensureSeed();
    const { id } = await params;
    const body = await req.json();

    await ticketsModel.actualizarTicket(
      id,
      {
        nombre: typeof body.nombre === "string" ? limpiarTexto(body.nombre, 100) : undefined,
        telefono: typeof body.telefono === "string" ? limpiarTelefono(body.telefono) : undefined,
        tipoVehiculoId: body.tipoVehiculoId ? Number(body.tipoVehiculoId) : undefined,
      },
      sesion.doc
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (sesion.role !== "gerente" && sesion.role !== "empleado") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    await ensureSeed();
    const { id } = await params;

    // Finalización: marca el ticket como finalizado, inactiva el vehículo
    // asociado y libera el puesto ocupado. Funciona tanto sobre un ticket
    // ya cobrado como sobre uno activo que se archiva sin cobrar.
    await ticketsModel.finalizarTicket(id, sesion.doc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaError(e);
  }
}
