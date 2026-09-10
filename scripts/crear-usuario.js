const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const readline = require("readline/promises");

const rolesPermitidos = new Set(["gerente", "empleado", "cliente"]);

function crearInterfaz() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function preguntar(interfaz, texto) {
  return interfaz.question(texto);
}

function preguntarPassword(texto) {
  if (!process.stdin.isTTY) {
    const interfaz = crearInterfaz();
    return preguntar(interfaz, texto).finally(() => interfaz.close());
  }

  return new Promise((resolve, reject) => {
    let valor = "";
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(texto);
    stdin.setRawMode(true);
    stdin.resume();

    function terminar(error, resultado) {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", recibirEntrada);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(resultado);
    }

    function recibirEntrada(buffer) {
      for (const caracter of buffer.toString()) {
        if (caracter === "\u0003") {
          terminar(new Error("Operación cancelada"));
        } else if (caracter === "\r" || caracter === "\n") {
          terminar(null, valor);
        } else if (caracter === "\u007f" || caracter === "\b") {
          valor = valor.slice(0, -1);
        } else {
          valor += caracter;
        }
      }
    }

    stdin.on("data", recibirEntrada);
  });
}

async function preguntarObligatorio(interfaz, texto) {
  let valor = "";
  while (!valor) {
    valor = (await preguntar(interfaz, texto)).trim();
    if (!valor) console.log("Este campo es obligatorio.");
  }
  return valor;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("No se encontró DATABASE_URL en .env");
  }

  const interfaz = crearInterfaz();
  let interfazCerrada = false;

  const cerrarInterfaz = () => {
    if (interfazCerrada) return;
    interfaz.close();
    interfazCerrada = true;
  };

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    console.log("Crear usuario\n");

    const documentoTexto = await preguntarObligatorio(interfaz, "Documento: ");
    const documento = Number(documentoTexto);
    if (!Number.isSafeInteger(documento) || documento <= 0) {
      throw new Error("El documento debe ser un número entero positivo.");
    }

    const nombre = await preguntarObligatorio(interfaz, "Nombre: ");
    const telefono = await preguntarObligatorio(interfaz, "Teléfono: ");
    const correo = await preguntarObligatorio(interfaz, "Correo: ");
    const cargo = (await preguntar(interfaz, "Cargo (opcional): ")).trim() || null;
    const rol = ((await preguntar(interfaz, "Rol (gerente/empleado/cliente) [empleado]: ")).trim() || "empleado").toLowerCase();
    if (!rolesPermitidos.has(rol)) {
      throw new Error("El rol debe ser gerente, empleado o cliente.");
    }

    cerrarInterfaz();

    const password = await preguntarPassword("Contraseña: ");
    if (!password) throw new Error("La contraseña no puede estar vacía.");

    const passwordHash = await bcrypt.hash(password, 10);

    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(50)");
      await cliente.query("INSERT INTO estados (nombre_estado) VALUES ('activo') ON CONFLICT DO NOTHING");
      await cliente.query("INSERT INTO roles (nombre_rol) VALUES ($1) ON CONFLICT DO NOTHING", [rol]);

      const resultado = await cliente.query(
        `INSERT INTO usuarios (
           documento, estados_id_estado, roles_id_roles, nombre,
           telefono, correo, contraseña, cargo
         )
         SELECT $1, e.id_estado, r.id_roles, $2, $3, $4, $5, $6
         FROM estados e
         JOIN roles r ON r.nombre_rol = $7
         WHERE e.nombre_estado = 'activo'
         RETURNING documento`,
        [documento, nombre, telefono, correo, passwordHash, cargo, rol]
      );

      await cliente.query("COMMIT");
      console.log(`Usuario ${resultado.rows[0].documento} creado correctamente.`);
    } catch (error) {
      await cliente.query("ROLLBACK");
      if (error.code === "23505") {
        throw new Error("El documento, teléfono o correo ya existe.");
      }
      throw error;
    } finally {
      cliente.release();
    }
  } finally {
    cerrarInterfaz();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
