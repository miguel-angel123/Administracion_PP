// Controlador de vehículos. Cubre:
//   GET  /api/vehiculos                  → lista paginada de vehículos
//   GET  /api/vehiculos?recurso=tipos    → catálogo de tipos de vehículo
//   GET  /api/vehiculos?recurso=puestos  → puestos del parqueadero
//   GET  /api/vehiculos?recurso=papelera → vehículos mensuales inactivados
//   POST /api/vehiculos                  → registrar vehículo mensual (gerente)
//   PUT  /api/vehiculos                  → ajustar total de puestos (gerente)
import { NextResponse } from "next/server";
import { getSesion } from "@/lib/session";
import { ensureSeed } from "@/lib/seed";
import * as vehiculosModel from "@/lib/models/vehiculos.model";
import * as puestosModel from "@/lib/models/puestos.model";
import { ErrorDominio } from "@/lib/models/errores";
import { registrarLog } from "@/lib/log";
import { limpiarPlaca, limpiarDocumento, limpiarTexto, limpiarTelefono } from "@/lib/sanitizar";

export async function GET(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  await ensureSeed();

  const { searchParams } = new URL(req.url);
  const recurso = searchParams.get("recurso");

  if (recurso === "tipos") {
    const tipos = await vehiculosModel.listarTiposVehiculo();
    return NextResponse.json(tipos);
  }

  if (recurso === "puestos") {
    const puestos = await puestosModel.listarPuestos();
    return NextResponse.json(puestos);
  }

  if (recurso === "papelera") {
    const inactivos = await vehiculosModel.listarVehiculosInactivos();
    return NextResponse.json(inactivos);
  }

  // Respuesta paginada: { datos, total, pagina, tamano, totalPaginas }.
  const resultado = await vehiculosModel.listarVehiculos({
    pagina: Number(searchParams.get("pagina") || 1),
    tamano: Number(searchParams.get("tamano") || 20),
    buscar: searchParams.get("buscar") || undefined,
    orden: (searchParams.get("orden") as
      | "placa"
      | "nombre"
      | "tipo"
      | "estado"
      | "ingreso"
      | null) || undefined,
    dir: (searchParams.get("dir") as "asc" | "desc" | null) || undefined,
    filtro: searchParams.get("filtro") || "todos",
  });

  return NextResponse.json(resultado);
}

export async function POST(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json(
      { error: "Solo el gerente puede registrar vehículos con contrato mensual" },
      { status: 403 }
    );
  }

  await ensureSeed();

  try {
    const body = await req.json();
    const resultado = await vehiculosModel.registrarVehiculoMensual({
      placa: limpiarPlaca(body.placa),
      doc: limpiarDocumento(body.doc),
      nombre: limpiarTexto(body.nombre, 100) || undefined,
      telefono: limpiarTelefono(body.telefono) || undefined,
      color: limpiarTexto(body.color, 30) || undefined,
      puestosIdPuesto: body.puestosIdPuesto,
    });

    const mensaje = resultado.clienteCreado
      ? `Registró vehículo ${resultado.placa} y creó cliente`
      : `Registró vehículo mensual ${resultado.placa}`;

    await registrarLog(sesion.doc, mensaje);

    return NextResponse.json(resultado);
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json({ error: e.message ?? "Error inesperado" }, { status });
  }
}

export async function PUT(req: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (sesion.role !== "gerente") {
    return NextResponse.json(
      { error: "Solo el gerente puede ajustar los puestos" },
      { status: 403 }
    );
  }

  await ensureSeed();

  try {
    const { total } = await req.json();
    const resultado = await puestosModel.ajustarTotalPuestos(Number(total));

    await registrarLog(sesion.doc, `Ajustó total de puestos a ${resultado.total}`);

    return NextResponse.json({ ok: true, total: resultado.total });
  } catch (e: any) {
    const status = e instanceof ErrorDominio ? e.status : 500;
    return NextResponse.json({ error: e.message ?? "Error inesperado" }, { status });
  }
}
