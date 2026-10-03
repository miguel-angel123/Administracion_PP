// Pool administra conexiones reutilizables a PostgreSQL.
const { Pool } = require("pg");

// bcryptjs permite crear hash seguro de la contrasena.
const bcrypt = require("bcryptjs");

// readline/promises permite preguntar datos por terminal usando await.
const readline = require("readline/promises");

// Roles validos que el script permite crear.
const rolesPermitidos = new Set(["gerente", "empleado", "cliente"]);

// Crea la interfaz de entrada/salida para preguntar por consola.
function crearInterfaz() {
  return readline.createInterface({
    // Entrada estandar: teclado/terminal.
    input: process.stdin,
    // Salida estandar: terminal.
    output: process.stdout,
  });
}

// Wrapper pequeno para preguntar texto usando una interfaz dada.
function preguntar(interfaz, texto) {
  // Devuelve una promesa con la respuesta escrita por el usuario.
  return interfaz.question(texto);
}

// Pregunta contrasena intentando ocultar lo que el usuario escribe.
function preguntarPassword(texto) {
  // Si no hay terminal interactiva, usa pregunta normal.
  if (!process.stdin.isTTY) {
    // Crea una interfaz temporal.
    const interfaz = crearInterfaz();
    // Pregunta y luego cierra la interfaz.
    return preguntar(interfaz, texto).finally(() => interfaz.close());
  }

  // En terminal interactiva usa modo raw para no imprimir caracteres.
  return new Promise((resolve, reject) => {
    // Acumula la contrasena escrita.
    let valor = "";
    // Alias de entrada estandar.
    const stdin = process.stdin;
    // Alias de salida estandar.
    const stdout = process.stdout;

    // Muestra el texto de la pregunta.
    stdout.write(texto);
    // Activa modo raw para capturar teclas una por una.
    stdin.setRawMode(true);
    // Reanuda lectura de stdin.
    stdin.resume();

    // Termina la lectura restaurando la terminal.
    function terminar(error, resultado) {
      // Desactiva modo raw.
      stdin.setRawMode(false);
      // Pausa la entrada.
      stdin.pause();
      // Quita el listener para evitar fugas.
      stdin.removeListener("data", recibirEntrada);
      // Salta de linea despues de escribir la contrasena.
      stdout.write("\n");
      // Rechaza o resuelve la promesa segun haya error.
      if (error) reject(error);
      else resolve(resultado);
    }

    // Procesa cada tecla recibida desde stdin.
    function recibirEntrada(buffer) {
      // Convierte el buffer en texto y recorre caracter por caracter.
      for (const caracter of buffer.toString()) {
        // Ctrl+C cancela la operacion.
        if (caracter === "\u0003") {
          terminar(new Error("Operación cancelada"));
        // Enter finaliza la captura.
        } else if (caracter === "\r" || caracter === "\n") {
          terminar(null, valor);
        // Backspace borra el ultimo caracter acumulado.
        } else if (caracter === "\u007f" || caracter === "\b") {
          valor = valor.slice(0, -1);
        // Cualquier otro caracter se agrega a la contrasena.
        } else {
          valor += caracter;
        }
      }
    }

    // Registra el listener que recibe las teclas.
    stdin.on("data", recibirEntrada);
  });
}

// Pregunta un campo hasta que el usuario escriba algo.
async function preguntarObligatorio(interfaz, texto) {
  // Valor inicial vacio para entrar al while.
  let valor = "";
  // Repite mientras el valor siga vacio.
  while (!valor) {
    // Pregunta, recorta espacios y guarda.
    valor = (await preguntar(interfaz, texto)).trim();
    // Informa que el campo no puede quedar vacio.
    if (!valor) console.log("Este campo es obligatorio.");
  }
  // Devuelve el valor valido.
  return valor;
}

// Funcion principal del script.
async function main() {
  // Verifica que exista DATABASE_URL antes de abrir conexiones.
  if (!process.env.DATABASE_URL) {
    throw new Error("No se encontró DATABASE_URL en .env");
  }

  // Crea interfaz para preguntas normales.
  const interfaz = crearInterfaz();
  // Bandera para no cerrar dos veces la misma interfaz.
  let interfazCerrada = false;

  // Cierra la interfaz si sigue abierta.
  const cerrarInterfaz = () => {
    // Si ya se cerro, no hace nada.
    if (interfazCerrada) return;
    // Cierra readline.
    interfaz.close();
    // Marca como cerrada.
    interfazCerrada = true;
  };

  // Crea pool de PostgreSQL para este script.
  const pool = new Pool({
    // Usa la cadena de conexion del entorno.
    connectionString: process.env.DATABASE_URL,
    // SSL para bases en nube; sin SSL para localhost.
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    // Encabezado visual del script.
    console.log("Crear usuario\n");

    // Pregunta documento como texto para validarlo antes de convertir.
    const documentoTexto = await preguntarObligatorio(interfaz, "Documento: ");
    // Convierte documento a numero.
    const documento = Number(documentoTexto);
    // Valida que sea entero positivo seguro.
    if (!Number.isSafeInteger(documento) || documento <= 0) {
      throw new Error("El documento debe ser un número entero positivo.");
    }

    // Pregunta campos requeridos del usuario.
    const nombre = await preguntarObligatorio(interfaz, "Nombre: ");
    const telefono = await preguntarObligatorio(interfaz, "Teléfono: ");
    const correo = await preguntarObligatorio(interfaz, "Correo: ");
    // Cargo es opcional; si queda vacio se guarda null.
    const cargo = (await preguntar(interfaz, "Cargo (opcional): ")).trim() || null;
    // Rol por defecto empleado si el usuario presiona Enter.
    const rol = ((await preguntar(interfaz, "Rol (gerente/empleado/cliente) [empleado]: ")).trim() || "empleado").toLowerCase();
    // Bloquea roles no permitidos.
    if (!rolesPermitidos.has(rol)) {
      throw new Error("El rol debe ser gerente, empleado o cliente.");
    }

    // Cierra interfaz normal antes de pedir contrasena oculta.
    cerrarInterfaz();

    // Pide la contrasena usando captura oculta.
    const password = await preguntarPassword("Contraseña: ");
    // No permite contrasena vacia.
    if (!password) throw new Error("La contraseña no puede estar vacía.");

    // Convierte contrasena a hash bcrypt.
    const passwordHash = await bcrypt.hash(password, 10);

    // Reserva una conexion concreta para usar transaccion.
    const cliente = await pool.connect();
    try {
      // Inicia transaccion.
      await cliente.query("BEGIN");
      // Asegura que exista la columna cargo.
      await cliente.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(50)");
      // Asegura que exista el estado activo.
      await cliente.query("INSERT INTO estados (nombre_estado) VALUES ('activo') ON CONFLICT DO NOTHING");
      // Asegura que exista el rol elegido.
      await cliente.query("INSERT INTO roles (nombre_rol) VALUES ($1) ON CONFLICT DO NOTHING", [rol]);

      // Inserta el usuario usando SELECT para resolver ids de estado y rol.
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
        // Parametros del INSERT, evitando concatenar SQL.
        [documento, nombre, telefono, correo, passwordHash, cargo, rol]
      );

      // Confirma la transaccion.
      await cliente.query("COMMIT");
      // Muestra el documento creado.
      console.log(`Usuario ${resultado.rows[0].documento} creado correctamente.`);
    } catch (error) {
      // Revierte si cualquier query falla.
      await cliente.query("ROLLBACK");
      // Codigo 23505 significa violacion de unicidad.
      if (error.code === "23505") {
        throw new Error("El documento, teléfono o correo ya existe.");
      }
      // Otros errores se propagan tal cual.
      throw error;
    } finally {
      // Devuelve la conexion al pool.
      cliente.release();
    }
  } finally {
    // Asegura cierre de interfaz aunque ocurra error.
    cerrarInterfaz();
    // Cierra todas las conexiones del pool antes de salir.
    await pool.end();
  }
}

// Ejecuta main y captura errores finales.
main().catch((error) => {
  // Muestra solo el mensaje para que sea claro al usuario.
  console.error(`Error: ${error.message}`);
  // Marca el proceso como fallido.
  process.exitCode = 1;
});
