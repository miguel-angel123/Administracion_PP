// Indicadores del dashboard. Disponibles para gerente y empleado.
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as estadisticasModel from "@/lib/models/estadisticas.model";
import { respuestaError } from "@/lib/erroresHttp";

export async function GET() {
  try {
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
      // "Activos" sale directo de `vehiculos.estados_id_estado`. Antes se
      // derivaba como mensuales + diarios, que cuenta contratos y tickets
      // (entidades), no vehículos: un vehículo con contrato y ticket abierto
      // sumaba 2.
      activos: indicadores.activos || 0,
      mensuales,
      diarios,
      totalPuestos,
      puestosOcupados,
      puestosDisponibles,
      ingresosSemanales,
    });
  } catch (e) {
    return respuestaError(e);
  }
}
