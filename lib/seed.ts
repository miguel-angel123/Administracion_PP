// Semilla y migración de esquema idempotente.
// Se ejecuta desde cada controlador antes de operar para asegurar que existan
// tablas, roles, estados, tarifas base, puestos y usuarios demo.
import bcrypt from "bcryptjs";
import pool from "./db";

// Estado compartido vía globalThis: sobrevive al hot-reload de Next en dev
// (una variable de módulo se resetea y haría correr el seed entero de nuevo).
// En serverless cada instancia tiene su propio global: el seed corre 1 vez por
// instancia, no en cada request.
const globalSeed = globalThis as unknown as {
  __seedPromise?: Promise<void>;
  __migrado?: boolean;
};

// MIGRACION_SQL agrupa cambios de esquema idempotentes:
// - ADD/DROP COLUMN IF EXISTS: no falla si ya está el estado final.
// - Inserts con NOT EXISTS: garantizan datos base sin duplicar.
// - Índices IF NOT EXISTS: aceleran los filtros/orden más frecuentes.
// (El recálculo de puestos se separó a MIGRACION_PUESTOS_SQL para poder
//  envolverlo en una transacción puntual sin bloquear el resto del DDL.)
//
// OJO: este bloque es un template literal. Nunca introducir backticks en los
// comentarios SQL: cierran el string y rompen la compilación. Los nombres de
// columnas se citan sin comillas o con comillas simples.
const MIGRACION_SQL = `
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(50);

  ALTER TABLE sugerencias ADD COLUMN IF NOT EXISTS resena INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sugerencias ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'pendiente';

  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS puestos_id_puesto INTEGER REFERENCES puestos(id_puesto);

  -- Columnas huérfanas del diseño inicial. Ninguna participa en la lógica de
  -- negocio y ensuciaban cada INSERT: se eliminan de forma idempotente.
  ALTER TABLE usuarios DROP COLUMN IF EXISTS genero;
  ALTER TABLE usuarios DROP COLUMN IF EXISTS fecha_nacimiento;
  ALTER TABLE contratos DROP COLUMN IF EXISTS estado_pago;
  ALTER TABLE tickets DROP COLUMN IF EXISTS estado_pago;

  INSERT INTO estados(nombre_estado)
  SELECT 'activo' WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre_estado='activo');
  INSERT INTO estados(nombre_estado)
  SELECT 'inactivo' WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre_estado='inactivo');
  INSERT INTO estados(nombre_estado)
  SELECT 'trabajando' WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre_estado='trabajando');
  INSERT INTO estados(nombre_estado)
  SELECT 'descansando' WHERE NOT EXISTS (SELECT 1 FROM estados WHERE nombre_estado='descansando');

  INSERT INTO roles(nombre_rol)
  SELECT 'gerente' WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre_rol='gerente');
  INSERT INTO roles(nombre_rol)
  SELECT 'empleado' WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre_rol='empleado');
  INSERT INTO roles(nombre_rol)
  SELECT 'cliente' WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre_rol='cliente');

  INSERT INTO puestos(numero_puesto, estado_puesto)
  SELECT n, false
  FROM generate_series(1, 100) n
  WHERE NOT EXISTS (SELECT 1 FROM puestos WHERE numero_puesto = n);

  INSERT INTO tarifa(tipo_vehiculo, valor_hora, valor_dia, valor_mes)
  SELECT 'diario', 3000, 18000, NULL
  WHERE NOT EXISTS (SELECT 1 FROM tarifa WHERE tipo_vehiculo='diario');

  INSERT INTO tarifa(tipo_vehiculo, valor_hora, valor_dia, valor_mes)
  SELECT 'mensual', NULL, 7000, 200000
  WHERE NOT EXISTS (SELECT 1 FROM tarifa WHERE tipo_vehiculo='mensual');

  INSERT INTO tarifa(tipo_vehiculo, valor_hora)
  SELECT 'por_hora', 3000
  WHERE NOT EXISTS (SELECT 1 FROM tarifa WHERE tipo_vehiculo='por_hora');

  -- Catálogo de tipos de vehículo. Se crea aquí porque la tabla existía sólo
  -- cuando se levantaba la BD manualmente; en un reinicio limpio faltaba y las
  -- tarifas quedaban con tipo_vehiculo_id NULL, perdiendo el tipo al editar.
  CREATE TABLE IF NOT EXISTS tipos_vehiculo (
    id_tipo_vehiculo SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    icono VARCHAR(10) NOT NULL DEFAULT '🚗',
    fecha_eliminado TIMESTAMP NULL
  );

  INSERT INTO tipos_vehiculo(nombre, icono)
  SELECT 'Automóvil', '🚗'
  WHERE NOT EXISTS (SELECT 1 FROM tipos_vehiculo WHERE nombre = 'Automóvil');

  INSERT INTO tipos_vehiculo(nombre, icono)
  SELECT 'Moto', '🏍️'
  WHERE NOT EXISTS (SELECT 1 FROM tipos_vehiculo WHERE nombre = 'Moto');

  INSERT INTO tipos_vehiculo(nombre, icono)
  SELECT 'Camioneta', '🚙'
  WHERE NOT EXISTS (SELECT 1 FROM tipos_vehiculo WHERE nombre = 'Camioneta');

  INSERT INTO tipos_vehiculo(nombre, icono)
  SELECT 'Camión', '🚚'
  WHERE NOT EXISTS (SELECT 1 FROM tipos_vehiculo WHERE nombre = 'Camión');

  -- Se elimina el índice antiguo (solo modalidad) si quedó de versiones previas.
  DROP INDEX IF EXISTS idx_tarifa_tipo_vehiculo_unique;

  -- Reasigna a "Automóvil" las tarifas huérfanas del seed que quedaron sin tipo.
  UPDATE tarifa
  SET tipo_vehiculo_id = (SELECT id_tipo_vehiculo FROM tipos_vehiculo WHERE nombre = 'Automóvil' LIMIT 1)
  WHERE tipo_vehiculo_id IS NULL
    AND fecha_eliminado IS NULL;

  -- Nuevo índice correcto: la combinación modalidad + tipo de vehículo es única.
  -- El filtro parcial excluye las tarifas soft-deleted.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tarifa_modalidad_tipo_unique
    ON tarifa (tipo_vehiculo, tipo_vehiculo_id) WHERE fecha_eliminado IS NULL;

  -- Índices de apoyo para los filtros y ordenamientos que usan los controladores.
  CREATE INDEX IF NOT EXISTS idx_vehiculos_placa ON vehiculos(placa);

  CREATE INDEX IF NOT EXISTS idx_vehiculos_placa_upper ON vehiculos(UPPER(placa));

  CREATE INDEX IF NOT EXISTS idx_tickets_placa_estado
    ON tickets(vehiculos_placa, fecha_eliminado, fecha_salida);

  CREATE INDEX IF NOT EXISTS idx_logs_fecha ON logs_sistema(fecha DESC);

  CREATE INDEX IF NOT EXISTS idx_sugerencias_doc ON sugerencias(usuarios_documento);

  CREATE INDEX IF NOT EXISTS idx_tarifa_modalidad_tipo
    ON tarifa(tipo_vehiculo, tipo_vehiculo_id, fecha_eliminado);

  CREATE INDEX IF NOT EXISTS idx_contratos_placa_activo
    ON contratos(vehiculos_placa, fecha_eliminado, fecha_fin);

  CREATE INDEX IF NOT EXISTS idx_puestos_estado
    ON puestos(estado_puesto, fecha_eliminado);

  CREATE INDEX IF NOT EXISTS idx_usuarios_nombre ON usuarios(nombre);

  -- Normaliza el estado de los vehículos diarios existentes. La columna
  -- estados_id_estado es ahora la fuente de verdad de "está en el
  -- parqueadero" para el listado y para los indicadores, pero cerrarTicket
  -- históricamente no la bajaba al cobrar: un diario ya salido quedaba en
  -- 'activo'. La lectura nueva confiaría en un dato stale. Se alinea una vez.
  UPDATE vehiculos v
  SET estados_id_estado = CASE
    WHEN EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.vehiculos_placa = v.placa
        AND t.fecha_salida IS NULL
        AND t.fecha_eliminado IS NULL
    ) THEN (SELECT id_estado FROM estados WHERE nombre_estado = 'activo' LIMIT 1)
    ELSE (SELECT id_estado FROM estados WHERE nombre_estado = 'inactivo' LIMIT 1)
  END
  WHERE v.fecha_eliminado IS NULL
    AND v.tarifa_id_tarifa IN (
      SELECT id_tarifa FROM tarifa WHERE tipo_vehiculo <> 'mensual'
    );

  -- Índice para el filtro por estado del listado de vehículos.
  CREATE INDEX IF NOT EXISTS idx_vehiculos_estado
    ON vehiculos(estados_id_estado, fecha_eliminado)
    WHERE fecha_eliminado IS NULL;

  -- Contador global para polling condicional. Se crea aquí (no en un script
  -- aparte) porque el cliente sondea /api/version en cada arranque; si la
  -- tabla falta, el endpoint devolvía 500 hasta que alguien corriera el SQL
  -- a mano. El seed corre una vez por proceso y garantiza que exista.
  CREATE TABLE IF NOT EXISTS sistema_version (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    version BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  INSERT INTO sistema_version (id) VALUES (TRUE)
  ON CONFLICT (id) DO NOTHING;

  CREATE OR REPLACE FUNCTION public.fn_marcar_version() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    UPDATE sistema_version
       SET version = version + 1, updated_at = NOW()
     WHERE id = TRUE;
    RETURN NULL;
  END;
  $fn$;

  -- FOR EACH STATEMENT: 1 incremento por sentencia, no por fila. Un
  -- generate_series de 1000 puestos suma 1, no 1000.
  --
  -- Se omite toda tabla que todavía no exista: DROP TRIGGER ... ON <tabla>
  -- resuelve el nombre de la tabla antes de comprobar el trigger, así que
  -- IF EXISTS no protege contra una tabla ausente y el bloque entero aborta.
  DO $do$
  DECLARE t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY[
      'tickets','vehiculos','contratos','puestos',
      'usuarios','tarifa','sugerencias','logs_sistema'
    ] LOOP
      IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
      EXECUTE format('DROP TRIGGER IF EXISTS tr_version_%I ON %I', t, t);
      EXECUTE format(
        'CREATE TRIGGER tr_version_%I
         AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH STATEMENT EXECUTE FUNCTION public.fn_marcar_version()',
        t, t
      );
    END LOOP;
  END $do$;
`;

// Recálculo de la bandera de ocupación. Se separó para envolverlo en su propia
// transacción: sin ella, un corte entre el FALSE global y el TRUE puntual deja
// la tabla de puestos mintiendo (todos libres) hasta el siguiente arranque.
const MIGRACION_PUESTOS_SQL = `
  UPDATE puestos SET estado_puesto = FALSE WHERE fecha_eliminado IS NULL;

  UPDATE puestos p
  SET estado_puesto = TRUE
  WHERE EXISTS (
    SELECT 1 FROM contratos c
    WHERE c.puestos_id_puesto = p.id_puesto
      AND c.fecha_eliminado IS NULL
      AND c.fecha_fin > NOW()
  )
  OR EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.puestos_id_puesto = p.id_puesto
      AND t.fecha_salida IS NULL
      AND t.fecha_eliminado IS NULL
  );
`;

// Aplica el script una sola vez por proceso.
async function aplicarMigraciones() {
  if (globalSeed.__migrado) return;

  await pool.query(MIGRACION_SQL);

  // El recálculo toca filas de `puestos`; se aísla en una transacción para
  // que sea atómico frente a arranques concurrentes en dev (hot-reload).
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query(MIGRACION_PUESTOS_SQL);
    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }

  globalSeed.__migrado = true;
}

// Inserta o actualiza un usuario base.
// - Contraseña: se hashea con bcrypt (coste 10).
// - Idempotente: ON CONFLICT (documento) actualiza datos pero no rehashea si ya está hasheada
//   (evita crear un hash nuevo cada arranque).
async function insertarUsuarioSeed(opts: {
  documento: number;
  nombre: string;
  telefono: string;
  correo: string;
  password: string;
  cargo: string | null;
  rol: string;
}) {
  const hash = await bcrypt.hash(opts.password, 10);

  await pool.query(
    `INSERT INTO usuarios (
       documento, estados_id_estado, roles_id_roles, nombre,
       telefono, correo, contraseña, cargo
     )
     SELECT $1, e.id_estado, r.id_roles, $2, $3, $4, $5, $6
     FROM estados e, roles r
     WHERE e.nombre_estado = 'activo' AND r.nombre_rol = $7
     ON CONFLICT (documento) DO UPDATE SET
       nombre = EXCLUDED.nombre,
       telefono = EXCLUDED.telefono,
       correo = EXCLUDED.correo,
       cargo = EXCLUDED.cargo,
       contraseña = CASE
         WHEN usuarios.contraseña NOT LIKE '$2%'
         THEN EXCLUDED.contraseña
         ELSE usuarios.contraseña
       END`,
    [
      opts.documento,
      opts.nombre,
      opts.telefono,
      opts.correo,
      hash,
      opts.cargo,
      opts.rol,
    ]
  );
}

// Crea vehículos demo solo si la tabla está vacía.
// Además garantiza que ABC123 (mensual) tenga contrato activo con un puesto asignado,
// para que las estadísticas de ocupación reflejen datos reales.
async function insertarVehiculosDemo() {
  const conteo = await pool.query(
    `SELECT COUNT(*)::int AS total FROM vehiculos WHERE fecha_eliminado IS NULL`
  );
  if (conteo.rows[0].total === 0) {
    await pool.query(
      `INSERT INTO vehiculos (placa, usuarios_documento, estados_id_estado, tarifa_id_tarifa, color)
       SELECT 'ABC123', 1234, e.id_estado, t.id_tarifa, 'Rojo'
       FROM estados e, tarifa t
       WHERE e.nombre_estado = 'activo' AND t.tipo_vehiculo = 'mensual'
       ON CONFLICT (placa) DO NOTHING`
    );

    await pool.query(
      `INSERT INTO vehiculos (placa, usuarios_documento, estados_id_estado, tarifa_id_tarifa, color)
       SELECT 'XYZ789', 1234, e.id_estado, t.id_tarifa, 'Negro'
       FROM estados e, tarifa t
       WHERE e.nombre_estado = 'activo' AND t.tipo_vehiculo = 'diario'
       ON CONFLICT (placa) DO NOTHING`
    );
  }

  // Contrato mensual de ABC123: se inserta solo si no existe otro activo.
  // Se le asigna el primer puesto vigente para que el demo ocupe un puesto real.
  await pool.query(
    `INSERT INTO contratos (
       tarifa_id_tarifa, vehiculos_placa, usuarios_documento,
       estados_id_estado, fecha_inicio, fecha_fin, puestos_id_puesto
     )
     SELECT t.id_tarifa, 'ABC123', 1234, e.id_estado,
            NOW(), NOW() + INTERVAL '1 month',
            (SELECT id_puesto FROM puestos
             WHERE fecha_eliminado IS NULL
             ORDER BY numero_puesto LIMIT 1)
     FROM tarifa t, estados e
     WHERE t.tipo_vehiculo = 'mensual' AND e.nombre_estado = 'activo'
       AND NOT EXISTS (
         SELECT 1 FROM contratos c
         WHERE c.vehiculos_placa = 'ABC123' AND c.fecha_eliminado IS NULL
       )`
  );

  // Marca el puesto del contrato demo como ocupado para que refleje el estado real.
  await pool.query(
    `UPDATE puestos SET estado_puesto = TRUE
     WHERE id_puesto = (
       SELECT puestos_id_puesto FROM contratos
       WHERE vehiculos_placa = 'ABC123' AND fecha_eliminado IS NULL
       ORDER BY fecha_inicio DESC LIMIT 1
     )`
  );
}

// Cuerpo del seed: corre exactamente una vez por instancia (ver ensureSeed).
async function ejecutarSeed() {
  await aplicarMigraciones();

  const usuarios = await pool.query(
    `SELECT COUNT(*)::int AS total FROM usuarios`
  );

  if (usuarios.rows[0].total === 0) {
    await insertarUsuarioSeed({
      documento: 1122338718,
      nombre: "Miguel Ángel Colobón",
      telefono: "3000000001",
      correo: "admin@pradera.co",
      password: "123",
      cargo: "Gerente",
      rol: "gerente",
    });

    await insertarUsuarioSeed({
      documento: 123,
      nombre: "Isaac Aray",
      telefono: "3000000002",
      correo: "isaac@pradera.co",
      password: "123",
      cargo: "Vigilante",
      rol: "empleado",
    });

    await insertarUsuarioSeed({
      documento: 124,
      nombre: "Miguel Ángel Godoy",
      telefono: "3000000003",
      correo: "godoy@pradera.co",
      password: "124",
      cargo: "Operativo",
      rol: "empleado",
    });

    await insertarUsuarioSeed({
      documento: 1234,
      nombre: "Carlos Pérez",
      telefono: "3000000004",
      correo: "carlos@gmail.com",
      password: "1234",
      cargo: null,
      rol: "cliente",
    });

    await insertarVehiculosDemo();
  } else {
    // Si ya hay usuarios, garantizar al menos un empleado activo (útil tras reseeds parciales).
    const empleadosExistentes = await pool.query(
      `SELECT 1 FROM usuarios u
       JOIN roles r ON r.id_roles = u.roles_id_roles
       WHERE r.nombre_rol = 'empleado'
         AND u.fecha_eliminado IS NULL
       LIMIT 1`
    );

    if (!empleadosExistentes.rows.length) {
      await insertarUsuarioSeed({
        documento: 123,
        nombre: "Isaac Aray",
        telefono: "3000000002",
        correo: "isaac@pradera.co",
        password: "123",
        cargo: "Vigilante",
        rol: "empleado",
      });

      await insertarUsuarioSeed({
        documento: 124,
        nombre: "Miguel Ángel Godoy",
        telefono: "3000000003",
        correo: "godoy@pradera.co",
        password: "124",
        cargo: "Operativo",
        rol: "empleado",
      });
    }

    // Migración de contraseñas: convierte cualquier texto plano histórico a hash bcrypt.
    const sinHash = await pool.query(
      `SELECT documento::int AS doc, contraseña
       FROM usuarios
       WHERE contraseña NOT LIKE '$2%'`
    );

    for (const usuario of sinHash.rows) {
      const hash = await bcrypt.hash(usuario.contraseña, 10);
      await pool.query(
        `UPDATE usuarios SET contraseña = $1 WHERE documento = $2`,
        [hash, usuario.doc]
      );
    }
  }
}

// Punto de entrada público. Idempotente y cacheado a nivel de proceso:
//   - Primer request: ejecuta el seed y guarda la promesa.
//   - Siguientes requests (incluyendo concurrentes): reciben la misma promesa.
//   - Si el seed falla, la promesa se limpia para reintentar en el próximo request.
export async function ensureSeed() {
  if (globalSeed.__seedPromise) return globalSeed.__seedPromise;

  globalSeed.__seedPromise = ejecutarSeed().catch((err) => {
    globalSeed.__seedPromise = undefined;
    throw err;
  });

  return globalSeed.__seedPromise;
}
