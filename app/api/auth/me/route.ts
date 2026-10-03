// Devuelve la sesión actual para rehidratar el cliente al recargar la página.
// NextResponse permite devolver JSON con status HTTP.
import { NextResponse } from "next/server";
// getSesion lee cookie, valida JWT y consulta usuario en base de datos.
import { getSesion } from "@/lib/session";
// respuestaError convierte errores tecnicos en respuestas HTTP consistentes.
import { respuestaError } from "@/lib/erroresHttp";

// Handler GET de /api/auth/me.
export async function GET() {
  try {
    // Obtiene la sesion real del usuario actual.
    const sesion = await getSesion();
    // Si no hay sesion valida, responde no autorizado.
    if (!sesion) {
      // 401: cookie ausente o JWT inválido. El AuthProvider lo trata como "sin sesión".
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    // Se incluye id numérico además del doc string para el tipo Usuario del cliente.
    // El spread agrega doc, role, name, email, phone y estado.
    return NextResponse.json({ ok: true, user: { id: Number(sesion.doc), ...sesion } });
  } catch (e) {
    // getSesion consulta la BD. Si Neon está en cold start, respuestaError
    // clasifica el timeout como 503 y el AuthProvider reintenta.
    return respuestaError(e);
  }
}
