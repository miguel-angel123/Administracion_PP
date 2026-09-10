// Devuelve la sesión actual para rehidratar el cliente al recargar la página.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    // 401 si la cookie falta o el JWT es inválido: el AuthProvider lo interpreta como "sin sesión".
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  // Se incluye id numérico además del doc string para compatibilidad con el tipo Usuario del cliente.
  return NextResponse.json({ ok: true, user: { id: Number(sesion.doc), ...sesion } });
}
