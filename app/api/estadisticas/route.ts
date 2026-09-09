import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as estadisticasModel from "@/lib/models/estadisticas.model";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente" && sesion.role !== "empleado") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();

  const [indicadores, ingresosSemanales] = await Promise.all([
    estadisticasModel.obtenerIndicadores(),
    estadisticasModel.obtenerIngresosSemanales(),
  ]);

  const mensuales = indicadores.mensuales || 0;
  const diarios = indicadores.diarios || 0;

  return NextResponse.json({
    totalVehiculos: indicadores.total_vehiculos || 0,
    activos: mensuales + diarios,
    mensuales,
    diarios,
    puestosDisponibles: 100 - (indicadores.puestos_ocupados || 0),
    ingresosSemanales,
  });
}
