import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as usuariosModel from "@/lib/models/usuarios.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ doc: string }> }
) {
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

  try {
    await usuariosModel.actualizarUsuario(Number(doc), {
      nombre: body.nombre,
      cargo: body.cargo,
      telefono: body.telefono,
      correo: body.correo,
      password: body.password,
      estado: body.estado,
    });

    await registrarLog(sesion.doc, `Editó empleado ${doc}`);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
