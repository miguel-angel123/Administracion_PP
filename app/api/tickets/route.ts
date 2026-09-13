// Colección de tickets. GET lista (paginado); POST crea un ticket diario (gerente o empleado).
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as ticketsModel from "@/lib/models/tickets.model";
import { respuestaError } from "@/lib/erroresHttp";
import { limpiarPlaca, limpiarDocumento, limpiarTelefono } from "@/lib/sanitizar";

export async function GET(req: Request) {
  try {
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

    if (sesion.role !== "gerente" && sesion.role !== "empleado") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    await ensureSeed();

    const body = await req.json();

    const resultado = await ticketsModel.crearTicket({
      placa: limpiarPlaca(body.placa),
      doc_propietario: limpiarDocumento(body.doc_propietario) || undefined,
      telefono: limpiarTelefono(body.telefono) || undefined,
      puestos_id_puesto: body.puestos_id_puesto,
      tipo_vehiculo_id: body.tipo_vehiculo_id ? Number(body.tipo_vehiculo_id) : undefined,
      operadorDoc: sesion.doc,
    });

    return NextResponse.json(resultado);
  } catch (e) {
    return respuestaError(e);
  }
}
