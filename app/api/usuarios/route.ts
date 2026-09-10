// Colección de usuarios. GET lista por rol (paginado); POST crea empleados (solo gerente).
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as usuariosModel from "@/lib/models/usuarios.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";
import { limpiarTexto, limpiarDocumento, limpiarTelefono } from "@/lib/sanitizar";

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
    // Respuesta paginada: { datos, total, pagina, tamano, totalPaginas }.
    const resultado = await usuariosModel.listarUsuariosPorRol(rol, {
      pagina: Number(searchParams.get("pagina") || 1),
      tamano: Number(searchParams.get("tamano") || 20),
      buscar: searchParams.get("buscar") || undefined,
      orden: (searchParams.get("orden") as
        | "nombre"
        | "cargo"
        | "documento"
        | null) || undefined,
      dir: (searchParams.get("dir") as "asc" | "desc" | null) || undefined,
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
      doc: Number(limpiarDocumento(body.doc)),
      nombre: limpiarTexto(body.nombre, 100),
      cargo: limpiarTexto(body.cargo, 50) || undefined,
      telefono: limpiarTelefono(body.telefono),
      correo: limpiarTexto(body.correo, 100),
      password: typeof body.password === "string" ? body.password : undefined,
      estado: typeof body.estado === "string" ? body.estado : undefined,
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
