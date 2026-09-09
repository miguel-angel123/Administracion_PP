import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as usuariosModel from "@/lib/models/usuarios.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";

export async function GET(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente" && sesion.role !== "empleado") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();
  const { searchParams } = new URL(req.url);
  const rol = searchParams.get("rol") || "empleado";

  try {
    const usuarios = await usuariosModel.listarUsuariosPorRol(rol);
    return NextResponse.json(usuarios);
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}

export async function POST(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();

  try {
    const body = await req.json();
    const resultado = await usuariosModel.crearEmpleado({
      doc: Number(body.doc),
      nombre: body.nombre,
      cargo: body.cargo,
      telefono: body.telefono,
      correo: body.correo,
      password: body.password,
      estado: body.estado,
    });

    await registrarLog(sesion.doc, `Registró empleado ${body.nombre}`);

    return NextResponse.json(resultado);
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
