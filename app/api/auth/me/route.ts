import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, user: { id: Number(sesion.doc), ...sesion } });
}
