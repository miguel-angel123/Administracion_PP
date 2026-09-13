// Modelo de tickets diarios: alta, cierre con cálculo y finalización.
import pool from "@/lib/db";
import { registrarLog } from "@/lib/log";
import { ErrorDominio } from "@/lib/models/errores";
import { obtenerTarifaPorTipo } from "./tarifas.model";
import { crearClienteSiNoExiste } from "./usuarios.model";

interface OpcionesListado {
  pagina?: number;
  tamano?: number;
  buscar?: string;
  orden?: "id" | "placa" | "propietario" | "entrada" | "estado";
  dir?: "asc" | "desc";
}

// Lista tickets con paginación y orden server-side.
// Los tickets finalizados (soft-deleted) no se listan: el WHERE los excluye
// siempre, por lo que el CASE del estado no necesita considerar ese caso.
//
// El ORDER BY arranca con `(tik.fecha_salida IS NULL) DESC`: en Postgres la
// comparación es boolean y DESC pone TRUE primero. Así los activos quedan
// siempre arriba y los cerrados abajo, sin importar la columna elegida por
// el operador (dentro de cada grupo se respeta el orden solicitado).
export async function listarTickets(opts: OpcionesListado = {}) {
  const pagina = Math.max(1, opts.pagina || 1);
  const tamano = Math.min(100, Math.max(1, opts.tamano || 20));
  const offset = (pagina - 1) * tamano;

  const filtros: string[] = ["tik.fecha_eliminado IS NULL"];
  const params: unknown[] = [];
  const hayBuscar = !!(opts.buscar && opts.buscar.trim());

  if (hayBuscar) {
    params.push(`%${opts.buscar!.trim()}%`);
    const idx = params.length;
    filtros.push(`(v.placa ILIKE $${idx} OR u.nombre ILIKE $${idx})`);
  }

  const where = "WHERE " + filtros.join(" AND ");

  const cols: Record<string, string> = {
    id: "tik.id_ticket",
    placa: "v.placa",
    propietario: "u.nombre",
    entrada: "tik.fecha_ingreso",
    estado: "estado",
  };
  const col = cols[opts.orden || "entrada"] || "tik.fecha_ingreso";
  const dir = opts.dir === "asc" ? "ASC" : "DESC";

  // El COUNT no requiere los JOINs cuando no hay búsqueda: ningún filtro toca
  // vehiculos ni usuarios. Se construye dinámicamente para no scannear de más.
  const joinsCount = hayBuscar
    ? `JOIN vehiculos v ON v.placa = tik.vehiculos_placa
       JOIN usuarios u ON u.documento = tik.usuarios_documento`
    : "";

  const [total, { rows }] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM tickets tik
       ${joinsCount}
       ${where}`,
      params
    ),
    pool.query(
      `SELECT
        tik.id_ticket::text AS id,
        v.placa,
        u.nombre AS propietario,
        TO_CHAR(tik.fecha_ingreso, 'DD-MM-YYYY HH24:MI') AS entrada,
        COALESCE(TO_CHAR(tik.fecha_salida, 'DD-MM-YYYY HH24:MI'), '—') AS salida,
        CASE
          WHEN tik.fecha_salida IS NULL THEN '—'
          ELSE tik.valor_total::text
        END AS total,
        CASE
          WHEN tik.fecha_salida IS NULL THEN 'activo'
          ELSE 'cerrado'
        END AS estado
      FROM tickets tik
      JOIN vehiculos v ON v.placa = tik.vehiculos_placa
      JOIN usuarios u ON u.documento = tik.usuarios_documento
      ${where}
      ORDER BY (tik.fecha_salida IS NULL) DESC, ${col} ${dir}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, tamano, offset]
    ),
  ]);

  return {
    datos: rows,
    total: total.rows[0].total,
    pagina,
    tamano,
    totalPaginas: Math.max(1, Math.ceil(total.rows[0].total / tamano)),
  };
}

// Crear ticket diario. Reglas:
//   1. Puesto debe existir y estar libre.
//   2. Si el vehículo ya existe y es mensual → error.
//   3. Si el vehículo no existe: crear vehículo diario y (si aplica) cliente nuevo.
//   4. No puede haber dos tickets abiertos para la misma placa.
//   5. Se ocupa el puesto elegido por el operador.
//   6. Se registra log con el operador actual.
//
// Todo corre en una transacción con FOR UPDATE sobre el puesto: dos operadores
// concurrentes no pueden pasar ambos la validación de "libre" y ocuparlo dos
// veces. El alta del cliente va en la misma transacción (ver usuarios.model);
// si el ticket falla, no queda un cliente huérfano.
// Los logs se escriben DESPUÉS del COMMIT: no se registra una acción que abortó.
//
// Placa conocida: el operador puede corregir el TIPO de vehículo (se actualiza
// la tarifa vigente del vehículo) y el TELÉFONO del propietario. El DOCUMENTO
// no se acepta: reasignar dueño se hace desde el módulo /vehiculos, no aquí.
export async function crearTicket(datos: {
  placa?: string;
  doc_propietario?: string;
  telefono?: string;
  puestos_id_puesto?: number;
  tipo_vehiculo_id?: number;
  operadorDoc: string;
}) {
  const {
    placa,
    doc_propietario,
    telefono,
    puestos_id_puesto,
    tipo_vehiculo_id,
    operadorDoc,
  } = datos;
  const placaLimpia = String(placa || "").toUpperCase().trim();

  if (!placaLimpia || !puestos_id_puesto) {
    throw new ErrorDominio("Faltan placa o puesto");
  }

  const cliente = await pool.connect();
  let clienteCreado = false;
  let docClienteNuevo: number | null = null;
  let ticketId = "";

  try {
    await cliente.query("BEGIN");

    // 1. Validación del puesto. FOR UPDATE bloquea la fila hasta el COMMIT:
    //    otro intento sobre el mismo puesto espera y luego ve estado = TRUE.
    const puesto = await cliente.query(
      `SELECT id_puesto, estado_puesto
       FROM puestos
       WHERE id_puesto = $1 AND fecha_eliminado IS NULL
       FOR UPDATE`,
      [Number(puestos_id_puesto)]
    );

    if (!puesto.rows.length || puesto.rows[0].estado_puesto) {
      throw new ErrorDominio("El puesto no existe o está ocupado");
    }

    // 2. ¿Existe el vehículo? Se trae el tipo de vehículo de su tarifa para
    //    heredarlo si aplica.
    const vehiculo = await cliente.query(
      `SELECT v.usuarios_documento, t.tipo_vehiculo AS tipo, t.tipo_vehiculo_id
       FROM vehiculos v
       JOIN tarifa t ON t.id_tarifa = v.tarifa_id_tarifa
       WHERE v.placa = $1 AND v.fecha_eliminado IS NULL
       LIMIT 1`,
      [placaLimpia]
    );

    // El puesto lo elige siempre el operador. El SELECT con FOR UPDATE del paso 1
    // ya validó que está libre y bloqueó la fila hasta el COMMIT.
    const puestoFinal = Number(puestos_id_puesto);

    // 3. Tipo de vehículo y tarifa diaria aplicable.
    //    Placa conocida → hereda el tipo de su tarifa vigente, salvo que el
    //    operador lo corrija (viene en `tipo_vehiculo_id`). Placa nueva → el
    //    operador debe seleccionarlo. La tarifa sale de la combinación
    //    modalidad "diario" × tipo, no de un diario genérico.
    let tipoVehiculoId: number;

    if (vehiculo.rows.length) {
      const tipoActualId = vehiculo.rows[0].tipo_vehiculo_id;
      if (!tipoActualId) {
        throw new ErrorDominio(
          "El vehículo no tiene tipo de vehículo configurado. Contacte al gerente.",
          500
        );
      }
      const tipoActual = Number(tipoActualId);
      tipoVehiculoId = tipo_vehiculo_id ? Number(tipo_vehiculo_id) : tipoActual;

      // El tipo actual ya está garantizado por la FK. Si el operador eligió uno
      // distinto, hay que validarlo contra el catálogo.
      if (tipoVehiculoId !== tipoActual) {
        if (!Number.isFinite(tipoVehiculoId) || tipoVehiculoId <= 0) {
          throw new ErrorDominio("Tipo de vehículo inválido", 400);
        }
        const existe = await cliente.query(
          `SELECT 1 FROM tipos_vehiculo
           WHERE id_tipo_vehiculo = $1 AND fecha_eliminado IS NULL`,
          [tipoVehiculoId]
        );
        if (!existe.rows.length) {
          throw new ErrorDominio("Tipo de vehículo no existe", 400);
        }
      }
    } else {
      if (!tipo_vehiculo_id) {
        throw new ErrorDominio("Seleccione el tipo de vehículo para la placa nueva", 400);
      }
      tipoVehiculoId = Number(tipo_vehiculo_id);
      if (!Number.isFinite(tipoVehiculoId) || tipoVehiculoId <= 0) {
        throw new ErrorDominio("Tipo de vehículo inválido", 400);
      }
      const existe = await cliente.query(
        `SELECT 1 FROM tipos_vehiculo
         WHERE id_tipo_vehiculo = $1 AND fecha_eliminado IS NULL`,
        [tipoVehiculoId]
      );
      if (!existe.rows.length) {
        throw new ErrorDominio("Tipo de vehículo no existe", 400);
      }
    }

    const tarifaDiaria = await obtenerTarifaPorTipo("diario", tipoVehiculoId, cliente);

    const estadoActivo = await cliente.query(
      `SELECT id_estado FROM estados WHERE nombre_estado = 'activo' LIMIT 1`
    );
    if (!estadoActivo.rows.length) {
      throw new ErrorDominio("Falta estado activo", 500);
    }
    const estadoActivoId = estadoActivo.rows[0].id_estado;

    let propietarioDoc: number;

    if (vehiculo.rows.length) {
      // Ya existe: debe ser diario.
      if (vehiculo.rows[0].tipo === "mensual") {
        throw new ErrorDominio("Los vehículos mensuales no usan tickets");
      }
      propietarioDoc = Number(vehiculo.rows[0].usuarios_documento);

      // Reactivación + corrección de tipo en un solo UPDATE. `tarifaDiaria` ya
      // resuelve la tarifa del tipo final (heredado o corregido por el operador).
      await cliente.query(
        `UPDATE vehiculos
         SET estados_id_estado = $1,
             tarifa_id_tarifa = $2
         WHERE placa = $3`,
        [estadoActivoId, tarifaDiaria.id_tarifa, placaLimpia]
      );

      // El operador pudo corregir el teléfono del propietario. El UPDATE
      // condicional evita escrituras cuando el valor no cambió.
      if (telefono) {
        await cliente.query(
          `UPDATE usuarios SET telefono = $1
           WHERE documento = $2 AND telefono <> $1`,
          [telefono, propietarioDoc]
        );
      }
    } else {
      // No existe: hace falta documento y teléfono del propietario.
      if (!doc_propietario) {
        throw new ErrorDominio("Ingrese documento del propietario para el vehículo diario");
      }

      if (!telefono) {
        throw new ErrorDominio("Ingrese teléfono del propietario para el vehículo diario");
      }

      const docFinal = Number(doc_propietario);

      // Alta o reactivación del cliente dentro de la misma transacción.
      const resultadoCliente = await crearClienteSiNoExiste(
        { doc: docFinal, telefono },
        cliente
      );
      clienteCreado = resultadoCliente.creado;
      docClienteNuevo = docFinal;

      // Alta del vehículo diario con la tarifa correcta por tipo. El DO UPDATE
      // reactiva la placa cuando existía pero estaba soft-deleted: sin esto,
      // un vehículo dado de baja conservaba su dueño y fecha_eliminado viejos,
      // y el ticket quedaba apuntando a un registro invisible para los listados.
      await cliente.query(
        `INSERT INTO vehiculos (placa, usuarios_documento, estados_id_estado, tarifa_id_tarifa, color)
         VALUES ($1, $2, $3, $4, 'No especificado')
         ON CONFLICT (placa) DO UPDATE SET
           fecha_eliminado = NULL,
           usuarios_documento = EXCLUDED.usuarios_documento,
           estados_id_estado = EXCLUDED.estados_id_estado,
           tarifa_id_tarifa = EXCLUDED.tarifa_id_tarifa`,
        [placaLimpia, docFinal, estadoActivoId, tarifaDiaria.id_tarifa]
      );

      propietarioDoc = docFinal;
    }

    // 4. No puede haber dos tickets abiertos de la misma placa.
    const ticketAbierto = await cliente.query(
      `SELECT 1 FROM tickets
       WHERE vehiculos_placa = $1 AND fecha_salida IS NULL AND fecha_eliminado IS NULL
       LIMIT 1`,
      [placaLimpia]
    );

    if (ticketAbierto.rows.length) {
      throw new ErrorDominio("El vehículo ya tiene un ticket abierto", 409);
    }

    // 5. Insertar el ticket. valor_total se llena al cerrar.
    const { rows } = await cliente.query(
      `INSERT INTO tickets (
         usuarios_documento, puestos_id_puesto, tarifa_id_tarifa,
         vehiculos_placa, estados_id_estado, fecha_ingreso,
         valor_total
       )
       VALUES ($1, $2, $3, $4, $5, NOW(), 0)
       RETURNING id_ticket::text AS id`,
      [
        propietarioDoc,
        puestoFinal,
        tarifaDiaria.id_tarifa,
        placaLimpia,
        estadoActivoId,
      ]
    );

    ticketId = rows[0].id;

    // 6. Ocupar el puesto.
    await cliente.query(
      `UPDATE puestos SET estado_puesto = TRUE WHERE id_puesto = $1`,
      [puestoFinal]
    );

    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }

  // Logs fuera de la transacción. registrarLog absorbe sus propios errores:
  // un fallo del log no debe reportar como fallida una operación ya confirmada.
  if (clienteCreado && docClienteNuevo !== null) {
    await registrarLog(operadorDoc, `Creó cliente ${docClienteNuevo} por ticket`);
  }
  await registrarLog(operadorDoc, `Registró ticket para ${placaLimpia}`);

  return { ok: true, id: ticketId };
}

// Cerrar ticket. Calcula valor_total por bloques de 24h:
//   - Cada día completo paga capDia (valor_dia).
//   - Las horas sobrantes se cobran a valorHora, mínimo 1h, con tope capDia.
//   - Si no hay valorHora, se cobra directo capDia (estadía sin cobro horario).
//
// Una estadía de 48h paga 2 días; una de 24h exactas paga 1 día sin sumar la
// hora que el Math.max(1, …) inyectaba por error. Es la regla estándar de
// parqueadero.
//
// La tarifa guardada en el ticket es la DIARIA (crearTicket inserta
// `tarifaDiaria.id_tarifa`), así que su `valor_hora` es NULL por diseño: cada
// modalidad cotiza sólo su propia columna. Para prorratear las horas se
// consulta la tarifa por_hora del MISMO tipo de vehículo con un LEFT JOIN. Si
// el tipo no tiene hora configurada, `valorHora` queda NULL y el cálculo cae
// al branch de "cobrar día completo".
//
// El SELECT, el cierre, la inactivación del vehículo y la liberación del
// puesto van en una sola transacción, y las tres mutaciones se hacen con
// CTEs encadenados (un round-trip). El UPDATE de `vehiculos` mantiene la
// columna `estados_id_estado` como fuente de verdad del listado: sin él,
// un diario ya cobrado quedaría visible como "activo" en /vehiculos y
// sumaría en `estadisticas.activos`.
export async function cerrarTicket(id: string, operadorDoc: string) {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const ticket = await cliente.query(
      `SELECT
         tik.id_ticket,
         tik.puestos_id_puesto,
         tik.vehiculos_placa,
         tar_dia.valor_dia,
         tar_hora.valor_hora,
         EXTRACT(EPOCH FROM (NOW() - tik.fecha_ingreso)) / 3600 AS horas
       FROM tickets tik
       JOIN tarifa tar_dia ON tar_dia.id_tarifa = tik.tarifa_id_tarifa
       LEFT JOIN tarifa tar_hora
         ON tar_hora.tipo_vehiculo = 'por_hora'
        AND tar_hora.tipo_vehiculo_id = tar_dia.tipo_vehiculo_id
        AND tar_hora.fecha_eliminado IS NULL
       WHERE tik.id_ticket = $1
         AND tik.fecha_salida IS NULL
         AND tik.fecha_eliminado IS NULL
       FOR UPDATE OF tik`,
      [Number(id)]
    );

    if (!ticket.rows.length) {
      throw new ErrorDominio("Ticket no encontrado o ya cerrado", 404);
    }

    const tk = ticket.rows[0];
    const horas = Number(tk.horas || 0);
    const capDia = Number(tk.valor_dia || 0);
    const valorHora = Number(tk.valor_hora || 0);

    // Cobro por bloques de 24h. El piso de 1h sólo aplica si hay sobrante:
    // a las 24h exactas el bloque de día ya cubre el cobro y no se suma hora.
    let valorTotal = capDia;
    if (valorHora > 0 && capDia > 0) {
      const diasCompletos = Math.floor(horas / 24);
      const horasRestantes = horas - diasCompletos * 24;
      const cobroRestante = horasRestantes > 0
        ? Math.min(Math.max(1, Math.ceil(horasRestantes)) * valorHora, capDia)
        : 0;
      valorTotal = diasCompletos * capDia + cobroRestante;
    } else if (valorHora > 0) {
      valorTotal = Math.max(1, Math.ceil(horas)) * valorHora;
    }

    await cliente.query(
      `WITH cerrado AS (
         UPDATE tickets
         SET fecha_salida = NOW(),
             valor_total = $1
         WHERE id_ticket = $2
         RETURNING puestos_id_puesto, vehiculos_placa
       ),
       upd_v AS (
         UPDATE vehiculos
         SET estados_id_estado = (
           SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo' LIMIT 1
         )
         WHERE placa = (SELECT vehiculos_placa FROM cerrado)
         RETURNING placa
       )
       UPDATE puestos
       SET estado_puesto = FALSE
       WHERE id_puesto = (SELECT puestos_id_puesto FROM cerrado)`,
      [valorTotal, Number(id)]
    );

    await cliente.query("COMMIT");
    await registrarLog(operadorDoc, `Cerró ticket ${tk.vehiculos_placa} por $${valorTotal}`);

    return { ok: true, valorTotal };
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
}

// Finaliza un ticket: lo marca como finalizado, marca el vehículo como inactivo
// y libera el puesto ocupado. Las tres mutaciones se hacen en un solo CTE.
// Sirve para los dos caminos del operador: cerrar el ciclo de un ticket ya
// cobrado, o archivar uno activo sin cobro (evasión / error de registro).
// Que esa segunda vía deje valor_total en 0 es deliberado: el cobro es
// responsabilidad de cerrarTicket, no de esta función.
// FOR UPDATE serializa la lectura con un cierre concurrente.
export async function finalizarTicket(id: string, operadorDoc: string) {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const ticket = await cliente.query(
      `SELECT puestos_id_puesto, vehiculos_placa
       FROM tickets
       WHERE id_ticket = $1
         AND fecha_eliminado IS NULL
       FOR UPDATE`,
      [Number(id)]
    );

    if (!ticket.rows.length) {
      throw new ErrorDominio("Ticket no encontrado", 404);
    }

    const { vehiculos_placa } = ticket.rows[0];

    await cliente.query(
      `WITH tk AS (
         UPDATE tickets
         SET fecha_eliminado = NOW(),
             fecha_salida = COALESCE(fecha_salida, NOW()),
             estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo' LIMIT 1)
         WHERE id_ticket = $1
         RETURNING puestos_id_puesto, vehiculos_placa
       ),
       upd_v AS (
         UPDATE vehiculos
         SET estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo' LIMIT 1)
         WHERE placa = (SELECT vehiculos_placa FROM tk)
         RETURNING placa
       )
       UPDATE puestos
       SET estado_puesto = FALSE
       WHERE id_puesto = (SELECT puestos_id_puesto FROM tk)`,
      [Number(id)]
    );

    await cliente.query("COMMIT");
    await registrarLog(operadorDoc, `Finalizó ticket ${vehiculos_placa}`);

    return { ok: true };
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
}

// Datos del ticket para imprimir el comprobante tras crear.
//
// La tarifa guardada en el ticket es la diaria: su `valor_hora` y `valor_mes`
// son NULL por diseño (cada modalidad cotiza su columna). El comprobante debe
// mostrar las tres tarifas del TIPO de vehículo del ticket, no las del ancla.
// Se resuelven con subselects sobre la misma `tipo_vehiculo_id`.
//
// El JOIN a `tipos_vehiculo` expone el nombre del tipo (Automóvil, Moto, …)
// para que el comprobante pueda distinguirlo de la modalidad "diario".
export async function obtenerTicketParaImpresion(id: string) {
  const { rows } = await pool.query(
    `SELECT
       tik.id_ticket::text AS id,
       v.placa,
       u.nombre AS propietario,
       u.documento,
       u.telefono,
       p.numero_puesto,
       TO_CHAR(tik.fecha_ingreso, 'DD-MM-YYYY HH24:MI') AS entrada,
       tar.tipo_vehiculo AS modalidad,
       tv.nombre AS tipo_vehiculo_nombre,
       (SELECT valor_hora FROM tarifa
        WHERE tipo_vehiculo = 'por_hora'
          AND tipo_vehiculo_id = tar.tipo_vehiculo_id
          AND fecha_eliminado IS NULL
        LIMIT 1) AS valor_hora,
       tar.valor_dia,
       (SELECT valor_mes FROM tarifa
        WHERE tipo_vehiculo = 'mensual'
          AND tipo_vehiculo_id = tar.tipo_vehiculo_id
          AND fecha_eliminado IS NULL
        LIMIT 1) AS valor_mes
     FROM tickets tik
     JOIN vehiculos v ON v.placa = tik.vehiculos_placa
     JOIN usuarios u ON u.documento = tik.usuarios_documento
     JOIN puestos p ON p.id_puesto = tik.puestos_id_puesto
     JOIN tarifa tar ON tar.id_tarifa = tik.tarifa_id_tarifa
     LEFT JOIN tipos_vehiculo tv ON tv.id_tipo_vehiculo = tar.tipo_vehiculo_id
     WHERE tik.id_ticket = $1`,
    [Number(id)]
  );

  return rows[0] || null;
}
