// Edición de un empleado específico por documento. Solo gerente.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as usuariosModel from "@/lib/models/usuarios.model";
import { respuestaError } from "@/lib/erroresHttp";
import { registrarLog } from "@/lib/log";
import { limpiarTexto, limpiarTelefono } from "@/lib/sanitizar";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ doc: string }> }
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
    const { doc } = await params;
    const body = await req.json();

    await usuariosModel.actualizarUsuario(Number(doc), {
      nombre: body.nombre !== undefined ? limpiarTexto(body.nombre, 100) : undefined,
      cargo: body.cargo !== undefined ? limpiarTexto(body.cargo, 50) : undefined,
      telefono: body.telefono !== undefined ? limpiarTelefono(body.telefono) : undefined,
      correo: body.correo !== undefined ? limpiarTexto(body.correo, 100) : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
      estado: typeof body.estado === "string" ? body.estado : undefined,
    });

    await registrarLog(sesion.doc, `Editó empleado ${doc}`);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaError(e);
  }
}
