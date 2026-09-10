import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as registrosModel from "@/lib/models/registros.model";

export async function GET(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // El log expone movimientos de todos los usuarios: solo gerente.
  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();

  const { searchParams } = new URL(req.url);

  const resultado = await registrosModel.listarRegistros({
    desde: searchParams.get("desde") || undefined,
    hasta: searchParams.get("hasta") || undefined,
    buscar: searchParams.get("buscar") || undefined,
    pagina: Number(searchParams.get("pagina") || 1),
    tamano: Number(searchParams.get("tamano") || 20),
    orden: (searchParams.get("orden") as "fecha" | "usuario" | "accion" | null) || "fecha",
    dir: (searchParams.get("dir") as "asc" | "desc" | null) || "desc",
    // paginado=0 fuerza modo export: devuelve todo el set filtrado (cap 10k).
    paginado: searchParams.get("paginado") !== "0",
  });

  return NextResponse.json(resultado);
}
