import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const logs = [
    { id: 1, tipo: "LOGIN", usuario: "Isaac Aray", accion: "Inicio de sesión", fecha: "2025-05-10 08:01" },
    { id: 2, tipo: "CREATE", usuario: "Isaac Aray", accion: "Registró vehículo GHI321", fecha: "2025-05-10 09:32" },
    { id: 3, tipo: "EDIT", usuario: "Miguel A. Colobón", accion: "Modificó vehículo ABC123", fecha: "2025-05-10 10:15" },
    { id: 4, tipo: "LOGIN", usuario: "Miguel A. Godoy", accion: "Inicio de sesión", fecha: "2025-05-10 11:00" },
    { id: 5, tipo: "INACTIVE", usuario: "Miguel A. Colobón", accion: "Inactivó vehículo DEF456", fecha: "2025-05-10 11:30" },
    { id: 6, tipo: "CREATE", usuario: "Carlos Pérez", accion: "Envió sugerencia", fecha: "2025-05-10 12:00" },
  ];

  return NextResponse.json(logs);
}
