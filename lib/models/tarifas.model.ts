// Modelo de tarifas. Una tarifa se identifica por (modalidad, tipo de vehículo).
// modalidad = "diario" | "mensual" | "por_hora".
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { ErrorDominio } from "./errores";

// Modalidades válidas. Se usa para validar antes de tocar la BD.
const MODALIDADES = ["diario", "mensual", "por_hora"];

// Devuelve la tarifa vigente de una modalidad. Si se pasa tipoVehiculoId,
// filtra también por tipo (auto/moto/…). Usada al crear ticket y al cerrar/cobrar.
// `client` permite ejecutar dentro de una transacción abierta por el llamador
// (crearTicket necesita resolver la tarifa sin abrir otra conexión que no vea
// el estado no confirmado).
export async function obtenerTarifaPorTipo(
  tipo: string,
  tipoVehiculoId?: number,
  client?: PoolClient
) {
  const q = client ?? pool;

  let query = `SELECT id_tarifa, tipo_vehiculo, tipo_vehiculo_id, valor_hora, valor_dia, valor_mes
               FROM tarifa
               WHERE tipo_vehiculo = $1 AND fecha_eliminado IS NULL`;
  const params: unknown[] = [tipo];
  if (tipoVehiculoId) {
    query += ` AND tipo_vehiculo_id = $2`;
    params.push(tipoVehiculoId);
  }
  query += ` ORDER BY id_tarifa LIMIT 1`;

  const { rows } = await q.query(query, params);
  if (!rows.length) {
    throw new ErrorDominio(`Tarifa ${tipo} no configurada`, 500);
  }
  return rows[0];
}

// Vista pública por tipo de vehículo. Una fila por cada tarifa real
// (combinación única de modalidad + tipo). Usada por /estadisticas y /tarifas.
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

// Traduce el 23505 (unique_violation) de Postgres al error de dominio 409.
// El índice único parcial `uq_tarifa_modalidad_tipo` es la autoridad de
// unicidad: el pre-check SELECT previo era una carrera en sí misma.
function esConflictoUnico(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

// Crear tarifa. Valida modalidad, tipo de vehículo y que exista el valor de la
// modalidad elegida. La unicidad la garantiza el índice único; si otro INSERT
// ganó la carrera, se traduce a 409.
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

  // Cada modalidad cotiza en su propia columna. Una tarifa sin valor es un
  // contrato sin precio: se rechaza en el backend aunque el frontend ya lo
  // bloquee, para que no dependa del cliente.
  if (modalidad === "por_hora" && (!datos.valorHora || datos.valorHora <= 0)) {
    throw new ErrorDominio("El valor por hora es obligatorio y debe ser mayor a 0", 400);
  }
  if (modalidad === "diario" && (!datos.valorDia || datos.valorDia <= 0)) {
    throw new ErrorDominio("El valor por día es obligatorio y debe ser mayor a 0", 400);
  }
  if (modalidad === "mensual" && (!datos.valorMes || datos.valorMes <= 0)) {
    throw new ErrorDominio("El valor por mes es obligatorio y debe ser mayor a 0", 400);
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

  try {
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
  } catch (e) {
    if (esConflictoUnico(e)) {
      throw new ErrorDominio(
        `Ya existe una tarifa ${modalidad} para este tipo de vehículo`,
        409
      );
    }
    throw e;
  }

  return { ok: true };
}

// Actualización parcial. Solo escribe los campos presentes.
//
// Corre en transacción con FOR UPDATE sobre la fila: el SELECT inicial fija el
// estado actual y la validación de coherencia se hace contra el ESTADO FINAL
// que tendría la tarifa tras aplicar los parciales, no contra el input. Sin
// esto, un PATCH { modalidad: "diario" } sobre una tarifa por_hora dejaba
// valor_dia en NULL y la fila quedaba sin el valor obligatorio de su modalidad.
//
// La unicidad (modalidad, tipo) la vigila el índice único parcial: cualquier
// choque con otra tarifa viva devuelve 23505, que se traduce a 409.
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
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const actual = await cliente.query(
      `SELECT tipo_vehiculo, valor_hora, valor_dia, valor_mes
       FROM tarifa
       WHERE id_tarifa = $1 AND fecha_eliminado IS NULL
       FOR UPDATE`,
      [id]
    );
    if (!actual.rows.length) {
      throw new ErrorDominio("Tarifa no encontrada o ya eliminada", 404);
    }

    // Estado final tras aplicar los cambios parciales sobre el actual.
    const fila = actual.rows[0];
    const modFinal = cambios.modalidad ?? fila.tipo_vehiculo;
    const vHora = cambios.valorHora !== undefined ? cambios.valorHora : fila.valor_hora;
    const vDia  = cambios.valorDia  !== undefined ? cambios.valorDia  : fila.valor_dia;
    const vMes  = cambios.valorMes  !== undefined ? cambios.valorMes  : fila.valor_mes;

    if (modFinal === "por_hora" && (!vHora || vHora <= 0)) {
      throw new ErrorDominio("La modalidad por_hora requiere valor_hora > 0", 400);
    }
    if (modFinal === "diario" && (!vDia || vDia <= 0)) {
      throw new ErrorDominio("La modalidad diario requiere valor_dia > 0", 400);
    }
    if (modFinal === "mensual" && (!vMes || vMes <= 0)) {
      throw new ErrorDominio("La modalidad mensual requiere valor_mes > 0", 400);
    }

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
      const tipo = await cliente.query(
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

    // Los tres campos de valor comparten la regla: null se acepta (limpiar la
    // columna de una modalidad que no aplica), pero 0 y negativos se rechazan.
    const invalidos = ([
      cambios.valorHora,
      cambios.valorDia,
      cambios.valorMes,
    ] as (number | null | undefined)[]).some(
      v => v !== undefined && v !== null && (typeof v !== "number" || v <= 0)
    );
    if (invalidos) {
      throw new ErrorDominio("Los valores deben ser mayores a 0", 400);
    }

    valores.push(id);
    await cliente.query(
      `UPDATE tarifa
       SET ${sets.join(", ")}
       WHERE id_tarifa = $${valores.length}`,
      valores
    );

    await cliente.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await cliente.query("ROLLBACK");
    if (esConflictoUnico(e)) {
      throw new ErrorDominio(
        "Ya existe una tarifa con esa modalidad y tipo de vehículo",
        409
      );
    }
    throw e;
  } finally {
    cliente.release();
  }
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
