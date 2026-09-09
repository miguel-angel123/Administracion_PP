import pool from "@/lib/db";

export async function listarRegistros() {
  const { rows } = await pool.query(`
    SELECT
      l.id_log AS id,
      CASE
        WHEN l.accion ILIKE '%login%' THEN 'LOGIN'
        WHEN l.accion ILIKE '%cancel%' OR l.accion ILIKE '%elimin%' THEN 'INACTIVE'
        WHEN l.accion ILIKE '%ticket%' THEN 'TICKET'
        WHEN l.accion ILIKE '%edit%' OR l.accion ILIKE '%editó%' OR l.accion ILIKE '%cambio%' THEN 'EDIT'
        WHEN l.accion ILIKE '%registr%' OR l.accion ILIKE '%creó%' OR l.accion ILIKE '%creo%' THEN 'CREATE'
        ELSE 'LOG'
      END AS tipo,
      COALESCE(u.nombre, 'Sistema') AS usuario,
      l.accion AS accion,
      TO_CHAR(l.fecha, 'YYYY-MM-DD HH24:MI') AS fecha
    FROM logs_sistema l
    LEFT JOIN usuarios u ON u.documento = l.usuarios_documento
    WHERE l.fecha_eliminado IS NULL
    ORDER BY l.fecha DESC
    LIMIT 300
  `);

  return rows;
}
