// Indicadores del dashboard. Disponibles para gerente y empleado.
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

  // Ejecuta las dos consultas agregadas en paralelo para reducir latencia.
  const [indicadores, ingresosSemanales] = await Promise.all([
    estadisticasModel.obtenerIndicadores(),
    estadisticasModel.obtenerIngresosSemanales(),
  ]);

  const mensuales = indicadores.mensuales || 0;
  const diarios = indicadores.diarios || 0;
  const totalPuestos = indicadores.total_puestos || 0;
  const puestosOcupados = indicadores.puestos_ocupados || 0;
  const puestosDisponibles = Math.max(0, totalPuestos - puestosOcupados);

  return NextResponse.json({
    totalVehiculos: indicadores.total_vehiculos || 0,
    // "Activos" se deriva: cualquier vehículo con contrato vigente o ticket abierto.
    activos: mensuales + diarios,
    mensuales,
    diarios,
    totalPuestos,
    puestosOcupados,
    puestosDisponibles,
    ingresosSemanales,
  });
}
