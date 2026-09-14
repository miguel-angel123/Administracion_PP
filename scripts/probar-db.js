// Importa Client desde pg para abrir una sola conexion directa a PostgreSQL.
const { Client } = require("pg");

// Carga variables desde .env si la version de Node soporta process.loadEnvFile.
process.loadEnvFile?.(".env");

// Lee la cadena de conexion DATABASE_URL desde el entorno.
const url = process.env.DATABASE_URL;

// Si no existe DATABASE_URL, el script no puede continuar.
if (!url) {
  // Muestra error claro en consola.
  console.error("Falta DATABASE_URL");
  // Termina el proceso con codigo de fallo.
  process.exit(1);
}

// Convierte la cadena de conexion en objeto URL para inspeccionarla.
const u = new URL(url);

// Muestra el host de PostgreSQL.
console.log("Host:", u.hostname);
// Muestra el puerto o 5432 si la URL no trae puerto explicito.
console.log("Puerto:", u.port || "5432");
// Muestra el nombre de la base quitando el slash inicial.
console.log("Base de datos:", u.pathname.slice(1));
// Muestra el usuario decodificado por si tiene caracteres especiales.
console.log("Usuario:", decodeURIComponent(u.username));

// Crea un cliente individual de PostgreSQL.
const client = new Client({
  // Usa la misma cadena de conexion del .env.
  connectionString: url,
  // En local no usa SSL; en nube acepta SSL gestionado.
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});

// Intenta conectarse a la base de datos.
client
  // Abre la conexion.
  .connect()
  // Si conecta correctamente, entra aqui.
  .then(() => {
    // Mensaje de exito visible en terminal.
    console.log("Conexión OK ✅");
    // Cierra la conexion limpiamente.
    return client.end();
  })
  // Si hay error de conexion, entra aqui.
  .catch((e) => {
    // Muestra codigo y mensaje de error de PostgreSQL/red.
    console.error("Error:", e.code, e.message);
    // Termina el proceso con fallo.
    process.exit(1);
  });
