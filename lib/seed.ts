// Semilla y migración de esquema idempotente.
// Se ejecuta desde cada controlador antes de operar para asegurar que existan
// tablas, roles, estados, tarifas base, puestos y usuarios demo.
// bcryptjs permite crear hashes de contrasenas iniciales.
import bcrypt from "bcryptjs";
// pool ejecuta SQL contra PostgreSQL.
import pool from "./db";

// Estado compartido vía globalThis: sobrevive al hot-reload de Next en dev
// (una variable de módulo se resetea y haría correr el seed entero de nuevo).
// En serverless cada instancia tiene su propio global: el seed corre 1 vez por
// instancia, no en cada request.
const globalSeed = globalThis as unknown as {
  // Promesa compartida del seed en ejecucion o ya ejecutado.
  __seedPromise?: Promise<void>;
  // Firma del último script aplicado en este proceso. Es un string y no un
  // booleano a propósito: si fuera boolean, editar MIGRACION_SQL en dev no
  // invalidaba el cache (globalThis sobrevive al HMR) y el DDL nuevo nunca
  // llegaba a Postgres hasta reiniciar el proceso. Comparar la firma re-aplica
  // automáticamente cuando el SQL cambia.
  __migrado?: string;
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

  -- Condiciones económicas del contrato mensual. Se guardan en contratos y no
  -- en vehiculos porque son propias de cada periodo de cobro.
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS precio   NUMERIC(12,2);
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS pagado   BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS dia_pago SMALLINT;

  -- Mes en curso en que se marcó pagado el contrato. Al cambiar el mes,
  -- el bool pagado deja de contar: la lectura se hace contra esta columna.
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS pagado_mes VARCHAR(7);

  UPDATE contratos
  SET pagado_mes = TO_CHAR(NOW(), 'YYYY-MM')
  WHERE pagado = TRUE AND pagado_mes IS NULL;

  -- Estado de pago del ticket diario. Vive en el ticket abierto (no en
  -- vehiculos) para que un mismo vehículo diario pueda marcarse pagado sin
  -- afectar su historial. El mapa lee esta columna para el tooltip.
  ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pagado BOOLEAN NOT NULL DEFAULT FALSE;

  -- Tarifa por minuto: la columna convive con valor_hora/valor_dia/valor_mes.
  -- Cada modalidad cotiza solo su propia columna; el cálculo del ticket
  -- combina minuto + hora + día para prorratear estadías cortas.
  ALTER TABLE tarifa ADD COLUMN IF NOT EXISTS valor_minuto NUMERIC(12,2);

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

  INSERT INTO tarifa(tipo_vehiculo, valor_minuto)
  SELECT 'por_minuto', 100
  WHERE NOT EXISTS (SELECT 1 FROM tarifa WHERE tipo_vehiculo='por_minuto');

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

  -- Índices de actividad reciente. Filtran por fecha_ingreso/fecha_inicio >=
  -- inicio de semana (P10) sin escanear el histórico completo de tickets y
  -- contratos.
  CREATE INDEX IF NOT EXISTS idx_tickets_fecha_ingreso ON tickets(fecha_ingreso);
  CREATE INDEX IF NOT EXISTS idx_contratos_fecha_inicio ON contratos(fecha_inicio);

  -- Índices parciales por patrón de acceso real:
  --   - idx_tickets_abiertos: el SELECT "ticket abierto por placa" que corre
  --     en crearTicket, cerrarTicket y actualizarVehiculo.
  --   - idx_tickets_doc_historial: historial del cliente (tickets cerrados).
  --   - idx_contratos_placa_inicio: último contrato por placa (LATERAL de
  --     listarVehiculos y de perfil).
  CREATE INDEX IF NOT EXISTS idx_tickets_abiertos
    ON tickets (vehiculos_placa, fecha_ingreso DESC)
    WHERE fecha_salida IS NULL AND fecha_eliminado IS NULL;

  CREATE INDEX IF NOT EXISTS idx_tickets_doc_historial
    ON tickets (usuarios_documento, fecha_ingreso DESC)
    WHERE fecha_salida IS NOT NULL AND fecha_eliminado IS NULL;

  CREATE INDEX IF NOT EXISTS idx_contratos_placa_inicio
    ON contratos (vehiculos_placa, fecha_inicio DESC)
    WHERE fecha_eliminado IS NULL;

  -- Alerta de pago del contrato: el chequeo por login filtra por dia_pago y
  -- por el mes pagado en curso. Sin índice, escanea contratos completo.
  CREATE INDEX IF NOT EXISTS idx_contratos_dia_pago_activos
    ON contratos (dia_pago, pagado_mes, fecha_fin)
    WHERE fecha_eliminado IS NULL;

  -- Índices trigram para los listados con ILIKE '%texto%': el btree no sirve
  -- para búsqueda mid-string. Se aísla en un DO block porque si el rol de
  -- conexión no puede habilitar pg_trgm (p.ej. Neon sin el flag desde la
  -- consola), un CREATE EXTENSION suelto abortaría todo MIGRACION_SQL en cada
  -- cold start. Con el guard, los trigram quedan omitidos y la app sigue.
  DO $trgm$
  DECLARE
    tiene_trgm boolean := false;
  BEGIN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      tiene_trgm := true;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_trgm no disponible (%), índices trigram omitidos', SQLERRM;
    END;

    IF tiene_trgm THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_usuarios_nombre_trgm
                 ON usuarios USING gin (nombre gin_trgm_ops)';
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vehiculos_placa_trgm
                 ON vehiculos USING gin (placa gin_trgm_ops)';
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_logs_accion_trgm
                 ON logs_sistema USING gin (accion gin_trgm_ops)';
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_usuarios_documento_text_trgm
                 ON usuarios USING gin ((documento::text) gin_trgm_ops)';
    END IF;
  END
  $trgm$;

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
  --
  -- logs_sistema queda FUERA del trigger: cada INSERT de auditoría (login,
  -- logout, altas) bumpeaba el contador global y despertaba a todos los
  -- clientes con polling activo. Es la tabla de mayor rotación del sistema y
  -- ninguno de sus cambios es dato en vivo para la UI. Se dropea el trigger
  -- en BDs donde ya existía, bajo to_regclass porque la tabla puede faltar
  -- en un arranque limpio.
  DO $do$
  DECLARE t text;
  BEGIN
    IF to_regclass('logs_sistema') IS NOT NULL THEN
      EXECUTE 'DROP TRIGGER IF EXISTS tr_version_logs_sistema ON logs_sistema';
    END IF;

    FOREACH t IN ARRAY ARRAY[
      'tickets','vehiculos','contratos','puestos',
      'usuarios','tarifa','sugerencias'
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
// El último UPDATE alinea `pagado` en contratos creados antes de que la columna
// fuera NOT NULL.
//
// El deriver de ocupación exige vehículo vigente Y activo: un mensual
// inactivado (papelera) mantiene su contrato pero su puesto debe quedar libre,
// igual que hace listarPuestos. Sin este filtro, el seed reocupaba el puesto
// que la inactivación había liberado.
const MIGRACION_PUESTOS_SQL = `
  UPDATE puestos SET estado_puesto = FALSE WHERE fecha_eliminado IS NULL;

  UPDATE puestos p
  SET estado_puesto = TRUE
  WHERE EXISTS (
    SELECT 1 FROM contratos c
    JOIN vehiculos v ON v.placa = c.vehiculos_placa
    WHERE c.puestos_id_puesto = p.id_puesto
      AND c.fecha_eliminado IS NULL
      AND c.fecha_fin > NOW()
      AND v.fecha_eliminado IS NULL
      AND v.estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'activo')
  )
  OR EXISTS (
    SELECT 1 FROM tickets t
    JOIN vehiculos v ON v.placa = t.vehiculos_placa
    WHERE t.puestos_id_puesto = p.id_puesto
      AND t.fecha_salida IS NULL
      AND t.fecha_eliminado IS NULL
      AND v.fecha_eliminado IS NULL
      AND v.estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'activo')
  );

  UPDATE contratos SET pagado = FALSE WHERE pagado IS NULL;
`;

// Aplica el script una sola vez por versión del SQL.
// El "por versión" importa: el flag vive en globalThis y sobrevive al
// hot-reload de Next. Si el cache fuera un booleano, editar MIGRACION_SQL en
// dev hacía early-return y el DDL nuevo nunca llegaba a Postgres hasta matar
// el proceso. Comparar la firma del SQL invalida el cache solo.
async function aplicarMigraciones() {
  // Firma = concatenación del DDL y los updates. Cualquier edición cambia el string.
  const firma = MIGRACION_SQL + MIGRACION_PUESTOS_SQL;

  // Si ya se aplicó exactamente este SQL en este proceso, no repite el DDL.
  if (globalSeed.__migrado === firma) return;

  // Ejecuta el bloque grande de cambios idempotentes.
  await pool.query(MIGRACION_SQL);

  // El recálculo toca filas de `puestos`; se aísla en una transacción para
  // que sea atómico frente a arranques concurrentes en dev (hot-reload).
  // connect reserva una conexion concreta del pool para manejar BEGIN/COMMIT.
  const cliente = await pool.connect();
  try {
    // Inicia transaccion.
    await cliente.query("BEGIN");
    // Recalcula puestos libres/ocupados como una sola unidad logica.
    await cliente.query(MIGRACION_PUESTOS_SQL);
    // Confirma cambios si no hubo error.
    await cliente.query("COMMIT");
  } catch (e) {
    // Revierte cambios parciales si algo falla.
    await cliente.query("ROLLBACK");
    // Propaga el error para que ensureSeed pueda liberar la promesa.
    throw e;
  } finally {
    // Devuelve la conexion al pool aunque haya error.
    cliente.release();
  }

  // Marca esta firma como aplicada en este proceso.
  globalSeed.__migrado = firma;
}

// Inserta o actualiza un usuario base.
// - Contraseña: se hashea con bcrypt (coste 10).
// - Idempotente: ON CONFLICT (documento) actualiza datos pero no rehashea si ya está hasheada
//   (evita crear un hash nuevo cada arranque).
async function insertarUsuarioSeed(opts: {
  // Documento unico del usuario.
  documento: number;
  // Nombre completo.
  nombre: string;
  // Telefono de contacto.
  telefono: string;
  // Correo de contacto.
  correo: string;
  // Contrasena en texto plano solo antes de hashearla.
  password: string;
  // Cargo aplica sobre todo a empleados/gerente; cliente puede ser null.
  cargo: string | null;
  // Rol que se buscara en la tabla roles.
  rol: string;
}) {
  // Convierte la contrasena a hash bcrypt con costo 10.
  const hash = await bcrypt.hash(opts.password, 10);

  // Inserta o actualiza el usuario seed.
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
       -- Solo reemplaza contrasenas que no parezcan hash bcrypt.
       contraseña = CASE
         WHEN usuarios.contraseña NOT LIKE '$2%'
         THEN EXCLUDED.contraseña
         ELSE usuarios.contraseña
       END`,
    // Valores parametrizados para evitar SQL injection y problemas de comillas.
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
  // Cuenta vehiculos vigentes para saber si debe crear datos demo.
  const conteo = await pool.query(
    `SELECT COUNT(*)::int AS total FROM vehiculos WHERE fecha_eliminado IS NULL`
  );
  // Solo si no hay vehiculos, crea dos placas de prueba.
  if (conteo.rows[0].total === 0) {
    // Crea vehiculo mensual ABC123 para el cliente demo.
    await pool.query(
      `INSERT INTO vehiculos (placa, usuarios_documento, estados_id_estado, tarifa_id_tarifa, color)
       SELECT 'ABC123', 1234, e.id_estado, t.id_tarifa, 'Rojo'
       FROM estados e, tarifa t
       WHERE e.nombre_estado = 'activo' AND t.tipo_vehiculo = 'mensual'
       ON CONFLICT (placa) DO NOTHING`
    );

    // Crea vehiculo diario XYZ789 para el cliente demo.
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
       estados_id_estado, fecha_inicio, fecha_fin, puestos_id_puesto,
       precio, dia_pago, pagado
     )
     SELECT t.id_tarifa, 'ABC123', 1234, e.id_estado,
            NOW(), NOW() + INTERVAL '1 month',
            (SELECT id_puesto FROM puestos
             WHERE fecha_eliminado IS NULL
             ORDER BY numero_puesto LIMIT 1),
            t.valor_mes, 5, FALSE
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
  // Primero asegura columnas, indices, catalogos y triggers.
  await aplicarMigraciones();

  // Cuenta usuarios para decidir si crear todos los usuarios demo.
  const usuarios = await pool.query(
    `SELECT COUNT(*)::int AS total FROM usuarios`
  );

  // Si la tabla usuarios esta vacia, se crea el paquete completo de prueba.
  if (usuarios.rows[0].total === 0) {
    // Usuario gerente demo.
    await insertarUsuarioSeed({
      documento: 1122338718,
      nombre: "Miguel Ángel Colobón",
      telefono: "3000000001",
      correo: "admin@pradera.co",
      password: "123",
      cargo: "Gerente",
      rol: "gerente",
    });

    // Usuario empleado demo 1.
    await insertarUsuarioSeed({
      documento: 123,
      nombre: "Isaac Aray",
      telefono: "3000000002",
      correo: "isaac@pradera.co",
      password: "123",
      cargo: "Vigilante",
      rol: "empleado",
    });

    // Usuario empleado demo 2.
    await insertarUsuarioSeed({
      documento: 124,
      nombre: "Miguel Ángel Godoy",
      telefono: "3000000003",
      correo: "godoy@pradera.co",
      password: "124",
      cargo: "Operativo",
      rol: "empleado",
    });

    // Usuario cliente demo.
    await insertarUsuarioSeed({
      documento: 1234,
      nombre: "Carlos Pérez",
      telefono: "3000000004",
      correo: "carlos@gmail.com",
      password: "1234",
      cargo: null,
      rol: "cliente",
    });

    // Crea vehiculos y contrato demo asociados al cliente.
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

    // Si no hay empleados, crea los dos empleados demo.
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

    // Recorre cada usuario con contrasena en texto plano historica.
    for (const usuario of sinHash.rows) {
      // Genera hash bcrypt para esa contrasena.
      const hash = await bcrypt.hash(usuario.contraseña, 10);
      // Reemplaza el texto plano por hash.
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
  // Si ya hay una promesa en curso, todos esperan esa misma promesa.
  if (globalSeed.__seedPromise) return globalSeed.__seedPromise;

  // Ejecuta seed y guarda la promesa global.
  globalSeed.__seedPromise = ejecutarSeed().catch((err) => {
    // Si falla, borra la promesa para permitir reintento futuro.
    globalSeed.__seedPromise = undefined;
    // Propaga el error original.
    throw err;
  });

  // Devuelve la promesa del seed.
  return globalSeed.__seedPromise;
}
