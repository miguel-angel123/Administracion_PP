// Modelo de tarifas. Una tarifa se identifica por (modalidad, tipo de vehículo).
// modalidad = "diario" | "mensual" | "por_hora".
import pool from "@/lib/db";
import { ErrorDominio } from "./errores";

// Modalidades válidas. Se usa para validar antes de tocar la BD.
const MODALIDADES = ["diario", "mensual", "por_hora"];

// Devuelve la tarifa vigente de una modalidad. Si se pasa tipoVehiculoId,
// filtra también por tipo (auto/moto/…). Usada al crear ticket y al cerrar/cobrar.
export async function obtenerTarifaPorTipo(tipo: string, tipoVehiculoId?: number) {
  let query = `SELECT id_tarifa, tipo_vehiculo, tipo_vehiculo_id, valor_hora, valor_dia, valor_mes
               FROM tarifa
               WHERE tipo_vehiculo = $1 AND fecha_eliminado IS NULL`;
  const params: unknown[] = [tipo];
  if (tipoVehiculoId) {
    query += ` AND tipo_vehiculo_id = $2`;
    params.push(tipoVehiculoId);
  }
  query += ` ORDER BY id_tarifa LIMIT 1`;

  const { rows } = await pool.query(query, params);
  if (!rows.length) {
    throw new ErrorDominio(`Tarifa ${tipo} no configurada`, 500);
  }
  return rows[0];
}

// Vista simplificada para renderizar tarjetas: {icon, plan, precio, desc}.
// Una entrada por modalidad activa.
export async function listarTarifasParaVista() {
  const { rows } = await pool.query(
    `SELECT tipo_vehiculo, valor_hora, valor_dia, valor_mes
     FROM tarifa
     WHERE fecha_eliminado IS NULL
     ORDER BY id_tarifa`
  );

  const mapa: Record<string, { icon: string; plan: string; precio: string; desc: string }> = {
    por_hora: {
      icon: "🕐",
      plan: "Por Hora",
      precio: `$${rows.find(r => r.tipo_vehiculo === "por_hora")?.valor_hora?.toLocaleString("es-CO") || "—"}`,
      desc: "Ideal para visitas cortas",
    },
    diario: {
      icon: "🗓️",
      plan: "Diario",
      precio: `$${rows.find(r => r.tipo_vehiculo === "diario")?.valor_dia?.toLocaleString("es-CO") || "—"}`,
      desc: "Todo el día con ticket",
    },
    mensual: {
      icon: "📅",
      plan: "Mensual",
      precio: `$${rows.find(r => r.tipo_vehiculo === "mensual")?.valor_mes?.toLocaleString("es-CO") || "—"}`,
      desc: "Puesto reservado por contrato mensual",
    },
  };

  return rows
    .map(r => mapa[r.tipo_vehiculo])
    .filter(Boolean);
}

// Vista pública por tipo de vehículo. Una fila por cada tarifa real
// (combinación única de modalidad + tipo). Usada por el cliente en /tarifas.
export async function listarTarifasPorTipo() {
  const { rows } = await pool.query(
    `SELECT
       t.id_tarifa::text AS id,
       t.tipo_vehiculo AS modalidad,
       t.tipo_vehiculo_id::text AS tipo_vehiculo_id,
       COALESCE(tv.nombre, 'General') AS tipo_nombre,
       COALESCE(tv.icono, '🚗') AS tipo_icono,
       t.valor_hora,
       t.valor_dia,
       t.valor_mes
     FROM tarifa t
     LEFT JOIN tipos_vehiculo tv ON tv.id_tipo_vehiculo = t.tipo_vehiculo_id
     WHERE t.fecha_eliminado IS NULL
     ORDER BY tv.nombre, t.tipo_vehiculo`
  );
  return rows;
}

// Vista administrativa (una fila por tarifa real, con tipo de vehículo).
// Útil para la pantalla de gerente que gestiona tarifas por tipo.
export async function listarTarifasAdmin() {
  const { rows } = await pool.query(
    `SELECT
       t.id_tarifa::text AS id,
       t.tipo_vehiculo AS modalidad,
       t.tipo_vehiculo_id::text AS tipo_vehiculo_id,
       COALESCE(tv.nombre, 'No asignado') AS tipo_vehiculo_nombre,
       COALESCE(tv.icono, '?') AS tipo_vehiculo_icono,
       t.valor_hora,
       t.valor_dia,
       t.valor_mes
     FROM tarifa t
     LEFT JOIN tipos_vehiculo tv ON tv.id_tipo_vehiculo = t.tipo_vehiculo_id
     WHERE t.fecha_eliminado IS NULL
     ORDER BY tv.nombre, t.tipo_vehiculo, t.id_tarifa`
  );
  return rows;
}

// Crear tarifa. Valida modalidad + tipo de vehículo y evita duplicados activos.
export async function crearTarifa(datos: {
  tipoVehiculoId: number | string;
  modalidad: string;
  valorHora?: number | null;
  valorDia?: number | null;
  valorMes?: number | null;
}) {
  const tipoId = Number(datos.tipoVehiculoId);
  if (!tipoId || Number.isNaN(tipoId) || tipoId <= 0) {
    throw new ErrorDominio("Se requiere un tipo de vehículo válido", 400);
  }

  const modalidad = datos.modalidad;
  if (!MODALIDADES.includes(modalidad)) {
    throw new ErrorDominio("Modalidad inválida. Use diario, mensual o por_hora", 400);
  }

  // Verifica que el tipo exista (evita huérfanos por FK).
  const tipoExiste = await pool.query(
    `SELECT id_tipo_vehiculo FROM tipos_vehiculo
     WHERE id_tipo_vehiculo = $1 AND fecha_eliminado IS NULL`,
    [tipoId]
  );
  if (!tipoExiste.rows.length) {
    throw new ErrorDominio("Tipo de vehículo no existe", 400);
  }

  // Solo una tarifa activa por (modalidad, tipo).
  const duplicado = await pool.query(
    `SELECT 1 FROM tarifa
     WHERE tipo_vehiculo = $1 AND tipo_vehiculo_id = $2 AND fecha_eliminado IS NULL
     LIMIT 1`,
    [modalidad, tipoId]
  );
  if (duplicado.rows.length) {
    throw new ErrorDominio(`Ya existe una tarifa ${modalidad} para este tipo de vehículo`, 409);
  }

  await pool.query(
    `INSERT INTO tarifa (tipo_vehiculo, tipo_vehiculo_id, valor_hora, valor_dia, valor_mes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      modalidad,
      tipoId,
      datos.valorHora ?? null,
      datos.valorDia ?? null,
      datos.valorMes ?? null,
    ]
  );

  return { ok: true };
}

// Actualización parcial. Solo escribe los campos presentes.
export async function actualizarTarifa(
  id: number,
  cambios: {
    tipoVehiculoId?: number | string;
    modalidad?: string;
    valorHora?: number | null;
    valorDia?: number | null;
    valorMes?: number | null;
  }
) {
  const sets: string[] = [];
  const valores: unknown[] = [];

  if (cambios.modalidad !== undefined) {
    if (!MODALIDADES.includes(cambios.modalidad)) {
      throw new ErrorDominio("Modalidad inválida", 400);
    }
    valores.push(cambios.modalidad);
    sets.push(`tipo_vehiculo = $${valores.length}`);
  }

  if (cambios.tipoVehiculoId !== undefined) {
    const tid = Number(cambios.tipoVehiculoId);
    if (!tid || Number.isNaN(tid) || tid <= 0) {
      throw new ErrorDominio("Tipo de vehículo inválido", 400);
    }
    const tipo = await pool.query(
      `SELECT id_tipo_vehiculo FROM tipos_vehiculo
       WHERE id_tipo_vehiculo = $1 AND fecha_eliminado IS NULL`,
      [tid]
    );
    if (!tipo.rows.length) {
      throw new ErrorDominio("Tipo de vehículo no existe", 400);
    }
    valores.push(tid);
    sets.push(`tipo_vehiculo_id = $${valores.length}`);
  }

  if (cambios.valorHora !== undefined) {
    valores.push(cambios.valorHora ?? null);
    sets.push(`valor_hora = $${valores.length}`);
  }

  if (cambios.valorDia !== undefined) {
    valores.push(cambios.valorDia ?? null);
    sets.push(`valor_dia = $${valores.length}`);
  }

  if (cambios.valorMes !== undefined) {
    valores.push(cambios.valorMes ?? null);
    sets.push(`valor_mes = $${valores.length}`);
  }

  if (!sets.length) {
    throw new ErrorDominio("No hay campos para actualizar", 400);
  }

  // Si se cambia modalidad o tipo, verifica que la combinación resultante no
  // choque con otra tarifa activa. Se consultan los valores actuales porque el
  // update es parcial y solo uno de los dos puede venir en el request.
  if (cambios.modalidad !== undefined || cambios.tipoVehiculoId !== undefined) {
    const actual = await pool.query(
      `SELECT tipo_vehiculo, tipo_vehiculo_id FROM tarifa
       WHERE id_tarifa = $1 AND fecha_eliminado IS NULL`,
      [id]
    );

    if (actual.rows.length) {
      const modalidadFinal = cambios.modalidad ?? actual.rows[0].tipo_vehiculo;
      const tipoFinal = cambios.tipoVehiculoId !== undefined
        ? Number(cambios.tipoVehiculoId)
        : actual.rows[0].tipo_vehiculo_id;

      const duplicado = await pool.query(
        `SELECT 1 FROM tarifa
         WHERE tipo_vehiculo = $1
           AND tipo_vehiculo_id = $2
           AND id_tarifa <> $3
           AND fecha_eliminado IS NULL
         LIMIT 1`,
        [modalidadFinal, tipoFinal, id]
      );

      if (duplicado.rows.length) {
        throw new ErrorDominio(`Ya existe una tarifa ${modalidadFinal} para este tipo de vehículo`, 409);
      }
    }
  }

  valores.push(id);
  await pool.query(
    `UPDATE tarifa
     SET ${sets.join(", ")}
     WHERE id_tarifa = $${valores.length} AND fecha_eliminado IS NULL`,
    valores
  );

  return { ok: true };
}

// Soft delete. Retorna 404 si la tarifa no existe o ya estaba eliminada.
export async function eliminarTarifa(id: number) {
  const { rows } = await pool.query(
    `UPDATE tarifa SET fecha_eliminado = NOW()
     WHERE id_tarifa = $1 AND fecha_eliminado IS NULL
     RETURNING id_tarifa`,
    [id]
  );

  if (!rows.length) {
    throw new ErrorDominio("Tarifa no encontrada o ya eliminada", 404);
  }

  return { ok: true };
}
