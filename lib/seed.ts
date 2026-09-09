import bcrypt from "bcryptjs";
import pool from "./db";

let seeded = false;
let migrado = false;

const MIGRACION_SQL = `
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(50);

  ALTER TABLE sugerencias ADD COLUMN IF NOT EXISTS resena INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sugerencias ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'pendiente';

  ALTER TABLE usuarios ALTER COLUMN fecha_nacimiento SET DEFAULT '2000-01-01';

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
`;

async function aplicarMigraciones() {
  if (migrado) return;
  await pool.query(MIGRACION_SQL);
  migrado = true;
}

async function insertarUsuarioSeed(opts: {
  documento: number;
  nombre: string;
  fechaNacimiento: string;
  telefono: string;
  correo: string;
  genero: "Masculino" | "Femenino" | "otro";
  password: string;
  cargo: string | null;
  rol: string;
}) {
  const hash = await bcrypt.hash(opts.password, 10);

  await pool.query(
    `INSERT INTO usuarios (
       documento, estados_id_estado, roles_id_roles, nombre, fecha_nacimiento,
       telefono, correo, genero, contraseña, cargo
     )
     SELECT $1, e.id_estado, r.id_roles, $2, $3, $4, $5, $6, $7, $8
     FROM estados e, roles r
     WHERE e.nombre_estado = 'activo' AND r.nombre_rol = $9
     ON CONFLICT (documento) DO UPDATE SET
       nombre = EXCLUDED.nombre,
       fecha_nacimiento = EXCLUDED.fecha_nacimiento,
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
      opts.fechaNacimiento,
      opts.telefono,
      opts.correo,
      opts.genero,
      hash,
      opts.cargo,
      opts.rol,
    ]
  );
}

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

  await pool.query(
    `INSERT INTO contratos (
       tarifa_id_tarifa, vehiculos_placa, usuarios_documento,
       estados_id_estado, fecha_inicio, fecha_fin, estado_pago
     )
     SELECT t.id_tarifa, 'ABC123', 1234, e.id_estado, NOW(), NOW() + INTERVAL '1 month', FALSE
     FROM tarifa t, estados e
     WHERE t.tipo_vehiculo = 'mensual' AND e.nombre_estado = 'activo'
       AND NOT EXISTS (
         SELECT 1 FROM contratos c
         WHERE c.vehiculos_placa = 'ABC123' AND c.fecha_eliminado IS NULL
       )`
  );
}

export async function ensureSeed() {
  if (seeded) return;

  await aplicarMigraciones();

  const usuarios = await pool.query(
    `SELECT COUNT(*)::int AS total FROM usuarios`
  );

  if (usuarios.rows[0].total === 0) {
    await insertarUsuarioSeed({
      documento: 1122338718,
      nombre: "Miguel Ángel Colobón",
      fechaNacimiento: "1990-01-01",
      telefono: "3000000001",
      correo: "admin@pradera.co",
      genero: "Masculino",
      password: "123",
      cargo: "Gerente",
      rol: "gerente",
    });

    await insertarUsuarioSeed({
      documento: 123,
      nombre: "Isaac Aray",
      fechaNacimiento: "1995-02-02",
      telefono: "3000000002",
      correo: "isaac@pradera.co",
      genero: "Masculino",
      password: "123",
      cargo: "Vigilante",
      rol: "empleado",
    });

    await insertarUsuarioSeed({
      documento: 124,
      nombre: "Miguel Ángel Godoy",
      fechaNacimiento: "1993-03-03",
      telefono: "3000000003",
      correo: "godoy@pradera.co",
      genero: "Masculino",
      password: "124",
      cargo: "Operativo",
      rol: "empleado",
    });

    await insertarUsuarioSeed({
      documento: 1234,
      nombre: "Carlos Pérez",
      fechaNacimiento: "1988-04-04",
      telefono: "3000000004",
      correo: "carlos@gmail.com",
      genero: "Masculino",
      password: "1234",
      cargo: null,
      rol: "cliente",
    });

    await insertarVehiculosDemo();
  } else {
    // Si ya hay usuarios, asegurar que exista al menos un empleado activo
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
        fechaNacimiento: "1995-02-02",
        telefono: "3000000002",
        correo: "isaac@pradera.co",
        genero: "Masculino",
        password: "123",
        cargo: "Vigilante",
        rol: "empleado",
      });

      await insertarUsuarioSeed({
        documento: 124,
        nombre: "Miguel Ángel Godoy",
        fechaNacimiento: "1993-03-03",
        telefono: "3000000003",
        correo: "godoy@pradera.co",
        genero: "Masculino",
        password: "124",
        cargo: "Operativo",
        rol: "empleado",
      });
    }

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

  seeded = true;
}
