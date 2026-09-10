// Actualización, borrado lógico y consulta puntual de un vehículo por placa.
// Todo el acceso a datos pasa por vehiculos.model (MVC estricto).
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as vehiculosModel from "@/lib/models/vehiculos.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";
import { limpiarTexto } from "@/lib/sanitizar";

// Devuelve si el vehículo existe y su último puesto registrado.
// Se usa en el modal de tickets para reutilizar el mismo puesto.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ placa: string }> }
) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();
  const { placa } = await params;

  const resultado = await vehiculosModel.obtenerVehiculoPorPlaca(placa);

  return NextResponse.json(resultado);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ placa: string }> }
) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();
  const { placa } = await params;
  const body = await req.json();

  try {
    // PATCH parcial: puede llegar solo estado, solo color, solo nombre, o solo puestosIdPuesto.
    await vehiculosModel.actualizarVehiculo(placa, {
      estado: typeof body.estado === "string" ? body.estado : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
      nombre: typeof body.nombre === "string" ? limpiarTexto(body.nombre, 100) : undefined,
      puestosIdPuesto: body.puestosIdPuesto ? Number(body.puestosIdPuesto) : undefined,
    });

    await registrarLog(sesion.doc, `Editó vehículo ${placa}`);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ placa: string }> }
) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  await ensureSeed();
  const { placa } = await params;

  try {
    // Borrado lógico: se conserva el historial pero el vehículo deja de aparecer.
    await vehiculosModel.eliminarVehiculoSoft(placa);
    await registrarLog(sesion.doc, `Eliminó vehículo ${placa}`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json(
      { error: e.message ?? "Error inesperado" },
      { status }
    );
  }
}
