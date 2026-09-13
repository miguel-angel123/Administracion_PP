// Modelo de registros (auditoría). Soporta paginación, rango de fechas, orden,
// búsqueda por acción y un modo "sin paginar" (tope duro de 10k) para exportaciones.
import pool from "@/lib/db";

interface OpcionesListado {
  desde?: string;
  hasta?: string;
  buscar?: string;
  pagina?: number;
  tamano?: number;
  orden?: "fecha" | "usuario" | "accion";
  dir?: "asc" | "desc";
  paginado?: boolean;
}

const MAX_EXPORT = 10000;

export async function listarRegistros(opts: OpcionesListado = {}) {
  const pagina = Math.max(1, opts.pagina || 1);
  const tamano = Math.min(100, Math.max(1, opts.tamano || 20));
  const offset = (pagina - 1) * tamano;
  const paginado = opts.paginado !== false;

  const filtros: string[] = ["l.fecha_eliminado IS NULL"];
  const params: unknown[] = [];

  if (opts.desde) {
    params.push(opts.desde);
    filtros.push(`l.fecha >= $${params.length}`);
  }

  if (opts.hasta) {
    // "< hasta + 1 día" cubre el día completo sin importar la hora de la fila.
    params.push(opts.hasta);
    filtros.push(`l.fecha < $${params.length}::date + INTERVAL '1 day'`);
  }

  if (opts.buscar && opts.buscar.trim()) {
    params.push(`%${opts.buscar.trim()}%`);
    filtros.push(`l.accion ILIKE $${params.length}`);
  }

  const where = "WHERE " + filtros.join(" AND ");

  // Whitelist de columnas: nunca se interpola texto del usuario en ORDER BY.
  const cols: Record<string, string> = {
    fecha: "l.fecha",
    usuario: "u.nombre",
    accion: "l.accion",
  };
  const col = cols[opts.orden || "fecha"] || "l.fecha";
  const dir = opts.dir === "asc" ? "ASC" : "DESC";

  const limitOffset = paginado
    ? `LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    : `LIMIT $${params.length + 1}`;

  const paramDatos = paginado ? [...params, tamano, offset] : [...params, MAX_EXPORT];

  // El COUNT no necesita el JOIN a usuarios (el WHERE solo filtra columnas de
  // logs_sistema). Quitarlo ahorra un hash join por request.
  // El COUNT y la página se lanzan en paralelo: son independientes.
  const [total, datos] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM logs_sistema l
       ${where}`,
      params
    ),
    pool.query(
      `SELECT
         l.id_log AS id,
         CASE
           WHEN l.accion ILIKE '%login%' OR l.accion ILIKE '%logout%' THEN 'LOGIN'
           WHEN l.accion ILIKE '%cancel%' OR l.accion ILIKE '%finaliz%' OR l.accion ILIKE '%elimin%' THEN 'INACTIVE'
           WHEN l.accion ILIKE '%ticket%' THEN 'TICKET'
           WHEN l.accion ILIKE '%edit%' OR l.accion ILIKE '%editó%' OR l.accion ILIKE '%cambio%' THEN 'EDIT'
           WHEN l.accion ILIKE '%registr%' OR l.accion ILIKE '%creó%' OR l.accion ILIKE '%creo%' THEN 'CREATE'
           ELSE 'LOG'
         END AS tipo,
         COALESCE(u.nombre, 'Sistema') AS usuario,
         l.accion AS accion,
         TO_CHAR(l.fecha, 'DD-MM-YYYY HH24:MI') AS fecha
       FROM logs_sistema l
       LEFT JOIN usuarios u ON u.documento = l.usuarios_documento
       ${where}
       ORDER BY ${col} ${dir}
       ${limitOffset}`,
      paramDatos
    ),
  ]);

  return {
    datos: datos.rows,
    total: total.rows[0].total,
    pagina,
    tamano,
    // En modo export no hay páginas: forzar 1 evita que el cliente intente
    // pedir página 2 sobre un set que llegó completo (cap 10k).
    totalPaginas: paginado
      ? Math.max(1, Math.ceil(total.rows[0].total / tamano))
      : 1,
  };
}
