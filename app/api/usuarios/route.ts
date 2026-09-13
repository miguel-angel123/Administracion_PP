// Colección de usuarios. GET lista por rol (paginado); POST crea empleados (solo gerente).
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as usuariosModel from "@/lib/models/usuarios.model";
import { respuestaError } from "@/lib/erroresHttp";
import { registrarLog } from "@/lib/log";
import { limpiarTexto, limpiarDocumento, limpiarTelefono } from "@/lib/sanitizar";

export async function GET(req: Request) {
  try {
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

    if (sesion.role !== "gerente") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    await ensureSeed();

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
  } catch (e) {
    return respuestaError(e);
  }
}
