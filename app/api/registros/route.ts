import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as registrosModel from "@/lib/models/registros.model";
import { respuestaError } from "@/lib/erroresHttp";

export async function GET(req: Request) {
  try {
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

    // ISO_DATE evita que un input "abc" llegue a Postgres y dispare 500.
    // La comparación lexicográfica de strings YYYY-MM-DD respeta el orden real.
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");

    if (desde && !ISO_DATE.test(desde)) {
      return NextResponse.json({ error: "Fecha 'desde' inválida (use YYYY-MM-DD)" }, { status: 400 });
    }
    if (hasta && !ISO_DATE.test(hasta)) {
      return NextResponse.json({ error: "Fecha 'hasta' inválida (use YYYY-MM-DD)" }, { status: 400 });
    }
    if (desde && hasta && desde > hasta) {
      return NextResponse.json({ error: "El rango de fechas está invertido" }, { status: 400 });
    }

    const resultado = await registrosModel.listarRegistros({
      desde: desde || undefined,
      hasta: hasta || undefined,
      buscar: searchParams.get("buscar") || undefined,
      pagina: Number(searchParams.get("pagina") || 1),
      tamano: Number(searchParams.get("tamano") || 20),
      orden: (searchParams.get("orden") as "fecha" | "usuario" | "accion" | null) || "fecha",
      dir: (searchParams.get("dir") as "asc" | "desc" | null) || "desc",
      // paginado=0 fuerza modo export: devuelve todo el set filtrado (cap 10k).
      paginado: searchParams.get("paginado") !== "0",
    });

    return NextResponse.json(resultado);
  } catch (e) {
    return respuestaError(e);
  }
}
