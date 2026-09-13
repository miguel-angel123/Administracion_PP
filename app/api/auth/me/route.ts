// Devuelve la sesión actual para rehidratar el cliente al recargar la página.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { respuestaError } from "@/lib/erroresHttp";

export async function GET() {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      // 401: cookie ausente o JWT inválido. El AuthProvider lo trata como "sin sesión".
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // Se incluye id numérico además del doc string para el tipo Usuario del cliente.
    return NextResponse.json({ ok: true, user: { id: Number(sesion.doc), ...sesion } });
  } catch (e) {
    // getSesion consulta la BD. Si Neon está en cold start, respuestaError
    // clasifica el timeout como 503 y el AuthProvider reintenta.
    return respuestaError(e);
  }
}
