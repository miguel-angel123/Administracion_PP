// Modelo de tickets diarios: alta, cierre con cálculo y finalización.
// pool ejecuta consultas SQL contra PostgreSQL.
import pool from "@/lib/db";
// registrarLog inserta auditoria de operaciones importantes.
import { registrarLog } from "@/lib/log";
// ErrorDominio permite errores con status HTTP esperado.
import { ErrorDominio } from "@/lib/models/errores";
// Obtiene la tarifa correcta por modalidad y tipo de vehiculo.
import { obtenerTarifaPorTipo } from "./tarifas.model";
// Crea o valida clientes dentro de la transaccion del ticket.
import { crearClienteSiNoExiste } from "./usuarios.model";
// Validaciones de formato con lanzamiento de error para el backend.
import { exigirPlaca, exigirDocumento, exigirTelefono } from "@/lib/validacion";

// Opciones del listado paginado de tickets.
interface OpcionesListado {
  // Pagina actual.
  pagina?: number;
  // Registros por pagina.
  tamano?: number;
  // Texto para buscar por placa o propietario.
  buscar?: string;
  // Columna permitida para ordenar.
  orden?: "id" | "placa" | "propietario" | "entrada" | "estado";
  // Direccion de ordenamiento.
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
  // Normaliza pagina minima.
  const pagina = Math.max(1, opts.pagina || 1);
  // Limita tamano de pagina.
  const tamano = Math.min(100, Math.max(1, opts.tamano || 20));
  // Calcula OFFSET para SQL.
  const offset = (pagina - 1) * tamano;

  // Filtro base: no mostrar tickets finalizados/eliminados.
  const filtros: string[] = ["tik.fecha_eliminado IS NULL"];
  // Parametros dinamicos del SQL.
  const params: unknown[] = [];
  // Indica si se aplicara busqueda textual.
  const hayBuscar = !!(opts.buscar && opts.buscar.trim());

  // Agrega filtro por placa o propietario si hay busqueda.
  if (hayBuscar) {
    params.push(`%${opts.buscar!.trim()}%`);
    const idx = params.length;
    filtros.push(`(v.placa ILIKE $${idx} OR u.nombre ILIKE $${idx})`);
  }

  // Clausula WHERE compartida por count y listado.
  const where = "WHERE " + filtros.join(" AND ");

  // Mapa blanco de columnas ordenables.
  const cols: Record<string, string> = {
    id: "tik.id_ticket",
    placa: "v.placa",
    propietario: "u.nombre",
    entrada: "tik.fecha_ingreso",
    estado: "estado",
  };
  // Columna segura para ORDER BY.
  const col = cols[opts.orden || "entrada"] || "tik.fecha_ingreso";
  // Direccion segura; por defecto DESC para ver recientes primero.
  const dir = opts.dir === "asc" ? "ASC" : "DESC";

  // El COUNT no requiere los JOINs cuando no hay búsqueda: ningún filtro toca
  // vehiculos ni usuarios. Se construye dinámicamente para no scannear de más.
  const joinsCount = hayBuscar
    ? `JOIN vehiculos v ON v.placa = tik.vehiculos_placa
       JOIN usuarios u ON u.documento = tik.usuarios_documento`
    : "";

  // Ejecuta count y datos en paralelo.
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
    // Tickets de la pagina actual.
    datos: rows,
    // Total de tickets filtrados.
    total: total.rows[0].total,
    // Pagina normalizada.
    pagina,
    // Tamano normalizado.
    tamano,
    // Total de paginas para UI.
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
  // Extrae los datos recibidos desde el route.ts.
  const {
    placa,
    doc_propietario,
    telefono,
    puestos_id_puesto,
    tipo_vehiculo_id,
    operadorDoc,
  } = datos;
  // Normaliza placa para guardar siempre en mayusculas.
  const placaLimpia = String(placa || "").toUpperCase().trim();

  // Validacion minima de entrada.
  if (!placaLimpia || !puestos_id_puesto) {
    throw new ErrorDominio("Faltan placa o puesto");
  }

  // Formato de placa: un caller directo (script, futuro server action) podía
  // colar "A1" o "AAAAAA" porque solo se verificaba no-vacío.
  exigirPlaca(placaLimpia);

  // Reserva conexion concreta para la transaccion.
  const cliente = await pool.connect();
  // Indica si el flujo creo o revivio un cliente.
  let clienteCreado = false;
  // Documento del cliente creado, usado despues para log.
  let docClienteNuevo: number | null = null;
  // Id del ticket creado, devuelto al frontend.
  let ticketId = "";

  try {
    // Inicia transaccion.
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

    // No permite usar puestos inexistentes u ocupados.
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
    // Se normaliza a numero para guardar en tickets.
    const puestoFinal = Number(puestos_id_puesto);

    // 3. Tipo de vehículo y tarifa diaria aplicable.
    //    Placa conocida → hereda el tipo de su tarifa vigente, salvo que el
    //    operador lo corrija (viene en `tipo_vehiculo_id`). Placa nueva → el
    //    operador debe seleccionarlo. La tarifa sale de la combinación
    //    modalidad "diario" × tipo, no de un diario genérico.
    // Guardara el id final del tipo de vehiculo.
    let tipoVehiculoId: number;

    // Si la placa ya existe, hereda o corrige su tipo.
    if (vehiculo.rows.length) {
      // Tipo actual asociado a la tarifa vigente del vehiculo.
      const tipoActualId = vehiculo.rows[0].tipo_vehiculo_id;
      // Si no tiene tipo configurado, el sistema no puede elegir tarifa.
      if (!tipoActualId) {
        throw new ErrorDominio(
          "El vehículo no tiene tipo de vehículo configurado. Contacte al gerente.",
          500
        );
      }
      // Normaliza tipo actual.
      const tipoActual = Number(tipoActualId);
      // Usa tipo enviado por operador o conserva tipo actual.
      tipoVehiculoId = tipo_vehiculo_id ? Number(tipo_vehiculo_id) : tipoActual;

      // El tipo actual ya está garantizado por la FK. Si el operador eligió uno
      // distinto, hay que validarlo contra el catálogo.
      if (tipoVehiculoId !== tipoActual) {
        // Valida que el id sea numerico positivo.
        if (!Number.isFinite(tipoVehiculoId) || tipoVehiculoId <= 0) {
          throw new ErrorDominio("Tipo de vehículo inválido", 400);
        }
        // Comprueba que exista en catalogo.
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
      // Para placa nueva el operador debe seleccionar tipo.
      if (!tipo_vehiculo_id) {
        throw new ErrorDominio("Seleccione el tipo de vehículo para la placa nueva", 400);
      }
      // Normaliza tipo elegido.
      tipoVehiculoId = Number(tipo_vehiculo_id);
      // Valida forma numerica del tipo.
      if (!Number.isFinite(tipoVehiculoId) || tipoVehiculoId <= 0) {
        throw new ErrorDominio("Tipo de vehículo inválido", 400);
      }
      // Comprueba que el tipo exista y no este eliminado.
      const existe = await cliente.query(
        `SELECT 1 FROM tipos_vehiculo
         WHERE id_tipo_vehiculo = $1 AND fecha_eliminado IS NULL`,
        [tipoVehiculoId]
      );
      if (!existe.rows.length) {
        throw new ErrorDominio("Tipo de vehículo no existe", 400);
      }
    }

    // Busca tarifa diaria correspondiente al tipo de vehiculo.
    const tarifaDiaria = await obtenerTarifaPorTipo("diario", tipoVehiculoId, cliente);

    // Busca id del estado activo para vehiculo y ticket.
    const estadoActivo = await cliente.query(
      `SELECT id_estado FROM estados WHERE nombre_estado = 'activo' LIMIT 1`
    );
    // Si no existe estado activo, falta catalogo base.
    if (!estadoActivo.rows.length) {
      throw new ErrorDominio("Falta estado activo", 500);
    }
    // Id numerico de estado activo.
    const estadoActivoId = estadoActivo.rows[0].id_estado;

    // Documento del propietario final que quedara en ticket.
    let propietarioDoc: number;

    // Flujo para placa ya registrada.
    if (vehiculo.rows.length) {
      // Ya existe: debe ser diario.
      if (vehiculo.rows[0].tipo === "mensual") {
        throw new ErrorDominio("Los vehículos mensuales no usan tickets");
      }
      // Usa propietario ya asociado al vehiculo.
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
        // El route ya limpia (limpiarTelefono), pero un caller directo debe
        // toparse con la regla: antes teléfono "abc" entraba al UPDATE.
        exigirTelefono(telefono);
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

      // Para placa nueva tambien se exige telefono.
      if (!telefono) {
        throw new ErrorDominio("Ingrese teléfono del propietario para el vehículo diario");
      }

      // Formato de doc/teléfono: la obligatoriedad ya se validó arriba, acá
      // se aprieta el formato para que "12" o "abc" no lleguen a la BD.
      exigirDocumento(doc_propietario);
      exigirTelefono(telefono);

      // Documento numerico del propietario nuevo/existente.
      const docFinal = Number(doc_propietario);

      // Alta o reactivación del cliente dentro de la misma transacción.
      const resultadoCliente = await crearClienteSiNoExiste(
        { doc: docFinal, telefono },
        cliente
      );
      // Guarda si se creo cliente.
      clienteCreado = resultadoCliente.creado;
      // Guarda doc para registrar log posterior.
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

      // El propietario final del ticket es el doc recien procesado.
      propietarioDoc = docFinal;
    }

    // 4. No puede haber dos tickets abiertos de la misma placa.
    const ticketAbierto = await cliente.query(
      `SELECT 1 FROM tickets
       WHERE vehiculos_placa = $1 AND fecha_salida IS NULL AND fecha_eliminado IS NULL
       LIMIT 1`,
      [placaLimpia]
    );

    // Bloquea duplicidad de ticket abierto por placa.
    if (ticketAbierto.rows.length) {
      throw new ErrorDominio("El vehículo ya tiene un ticket abierto", 409);
    }

    // 5. Insertar el ticket. valor_total se llena al cerrar.
    // RETURNING trae el id generado por PostgreSQL.
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

    // Guarda id para devolverlo despues del COMMIT.
    ticketId = rows[0].id;

    // 6. Ocupar el puesto.
    await cliente.query(
      `UPDATE puestos SET estado_puesto = TRUE WHERE id_puesto = $1`,
      [puestoFinal]
    );

    // Confirma ticket + vehiculo + puesto + cliente.
    await cliente.query("COMMIT");
  } catch (e) {
    // Deshace todo si una validacion o consulta falla.
    await cliente.query("ROLLBACK");
    // Propaga error al controlador.
    throw e;
  } finally {
    // Devuelve conexion al pool.
    cliente.release();
  }

  // Logs fuera de la transacción. registrarLog absorbe sus propios errores:
  // un fallo del log no debe reportar como fallida una operación ya confirmada.
  if (clienteCreado && docClienteNuevo !== null) {
    await registrarLog(operadorDoc, `Creó cliente ${docClienteNuevo} por ticket`);
  }
  // Registra la creacion del ticket.
  await registrarLog(operadorDoc, `Registró ticket para ${placaLimpia}`);

  // Respuesta final para la API.
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
  // Reserva conexion para manejar transaccion.
  const cliente = await pool.connect();

  try {
    // Inicia transaccion.
    await cliente.query("BEGIN");

    // Lee el ticket abierto y bloquea su fila para evitar cierres simultaneos.
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

    // Si no existe o ya tiene salida, no se puede cerrar.
    if (!ticket.rows.length) {
      throw new ErrorDominio("Ticket no encontrado o ya cerrado", 404);
    }

    // Fila del ticket encontrada.
    const tk = ticket.rows[0];
    // Horas transcurridas desde fecha_ingreso hasta ahora.
    const horas = Number(tk.horas || 0);
    // Tope diario o valor del dia.
    const capDia = Number(tk.valor_dia || 0);
    // Valor por hora del mismo tipo de vehiculo.
    const valorHora = Number(tk.valor_hora || 0);

    // Cobro por bloques de 24h. El piso de 1h sólo aplica si hay sobrante:
    // a las 24h exactas el bloque de día ya cubre el cobro y no se suma hora.
    // Valor inicial: cobra al menos el dia si no hay tarifa por hora util.
    let valorTotal = capDia;
    // Si hay hora y dia, aplica bloques de 24 horas con tope diario.
    if (valorHora > 0 && capDia > 0) {
      // Dias completos de parqueo.
      const diasCompletos = Math.floor(horas / 24);
      // Horas que sobran despues de los dias completos.
      const horasRestantes = horas - diasCompletos * 24;
      // Cobro de horas restantes con minimo 1 hora y maximo valor_dia.
      const cobroRestante = horasRestantes > 0
        ? Math.min(Math.max(1, Math.ceil(horasRestantes)) * valorHora, capDia)
        : 0;
      // Total final combinando dias completos y resto.
      valorTotal = diasCompletos * capDia + cobroRestante;
    } else if (valorHora > 0) {
      // Si solo hay tarifa por hora, cobra horas redondeadas hacia arriba.
      valorTotal = Math.max(1, Math.ceil(horas)) * valorHora;
    }

    // Cierra ticket, inactiva vehiculo y libera puesto en un solo SQL con CTEs.
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

    // Confirma los cambios.
    await cliente.query("COMMIT");
    // Registra log del cierre ya confirmado.
    await registrarLog(operadorDoc, `Cerró ticket ${tk.vehiculos_placa} por $${valorTotal}`);

    // Devuelve total calculado para mostrarlo al operador.
    return { ok: true, valorTotal };
  } catch (e) {
    // Revierte si algo falla.
    await cliente.query("ROLLBACK");
    // Propaga error a la API.
    throw e;
  } finally {
    // Libera conexion.
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
  // Reserva conexion para transaccion.
  const cliente = await pool.connect();

  try {
    // Inicia transaccion.
    await cliente.query("BEGIN");

    // Lee ticket y lo bloquea para evitar finalizaciones/cierres simultaneos.
    const ticket = await cliente.query(
      `SELECT puestos_id_puesto, vehiculos_placa
       FROM tickets
       WHERE id_ticket = $1
         AND fecha_eliminado IS NULL
       FOR UPDATE`,
      [Number(id)]
    );

    // Si no existe, reporta 404.
    if (!ticket.rows.length) {
      throw new ErrorDominio("Ticket no encontrado", 404);
    }

    // Placa usada para el log despues del commit.
    const { vehiculos_placa } = ticket.rows[0];

    // Marca ticket como eliminado, inactiva vehiculo y libera puesto.
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

    // Confirma los cambios.
    await cliente.query("COMMIT");
    // Registra la accion ya confirmada.
    await registrarLog(operadorDoc, `Finalizó ticket ${vehiculos_placa}`);

    // Respuesta simple para la API.
    return { ok: true };
  } catch (e) {
    // Revierte cambios parciales.
    await cliente.query("ROLLBACK");
    // Propaga error.
    throw e;
  } finally {
    // Libera conexion.
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
  // Consulta todos los datos necesarios para construir el comprobante.
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

  // Devuelve el ticket o null si no existe.
  return rows[0] || null;
}
