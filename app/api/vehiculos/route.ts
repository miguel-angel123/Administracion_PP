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
import { respuestaError } from "@/lib/erroresHttp";
import { registrarLog } from "@/lib/log";
import { limpiarPlaca, limpiarDocumento, limpiarTexto, limpiarTelefono } from "@/lib/sanitizar";

export async function GET(req: Request) {
  try {
    const sesion = await getSesion();
    if (!sesion) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await ensureSeed();

    const { searchParams } = new URL(req.url);
    const recurso = searchParams.get("recurso");

    // Listado, papelera y puestos son operativos: solo gerente/empleado.
    // El catálogo de tipos lo consume /tarifas, visible a clientes: se exceptúa.
    // Sin este guard, un cliente con la URL directa listaba vehículos aunque
    // /vehiculos no esté en su menú permitido.
    const esOperativo = sesion.role === "gerente" || sesion.role === "empleado";
    if (!esOperativo && recurso !== "tipos") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

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
  } catch (e) {
    return respuestaError(e);
  }
}

export async function POST(req: Request) {
  try {
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
  } catch (e) {
    return respuestaError(e);
  }
}

export async function PUT(req: Request) {
  try {
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

    const { total } = await req.json();
    const resultado = await puestosModel.ajustarTotalPuestos(Number(total));

    await registrarLog(sesion.doc, `Ajustó total de puestos a ${resultado.total}`);

    return NextResponse.json({ ok: true, total: resultado.total });
  } catch (e) {
    return respuestaError(e);
  }
}
