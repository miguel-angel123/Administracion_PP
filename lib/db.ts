// Cliente PostgreSQL compartido por todo el backend.
// Todas las consultas de modelos y controladores deben pasar por este pool.
// Pool administra varias conexiones reutilizables a PostgreSQL.
import { Pool } from "pg";

// Cadena de conexión que viene del .env. Si falta, se falla rápido y no se levanta la app.
// DATABASE_URL debe contener usuario, contrasena, host, puerto y base de datos.
const connectionString = process.env.DATABASE_URL;

// Valida la configuracion obligatoria antes de crear el pool.
if (!connectionString) {
  // Error temprano: es mejor fallar al arrancar que fallar en cada consulta.
  throw new Error("DATABASE_URL no está definida en el archivo .env");
}

// Guarda el pool en globalThis para que el hot-reload de Next no cree pools nuevos
// en cada recompilación en desarrollo (evita agotar el límite de conexiones).
// El cast permite guardar una propiedad propia llamada __pool en globalThis.
const globalDb = globalThis as unknown as { __pool?: Pool };

// Exporta un unico pool compartido.
export const pool =
  // Si ya existe un pool global en desarrollo, lo reutiliza.
  globalDb.__pool ??
  // Si no existe, crea un pool nuevo.
  new Pool({
    // Cadena completa de conexion a PostgreSQL.
    connectionString,
    // Neon y otros Postgres gestionados requieren SSL.
    // En local (localhost) se desactiva para no exigir certificados.
    // rejectUnauthorized false acepta certificados gestionados/autofirmados.
    ssl: connectionString.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
    // Un pool chico y caliente evita pagar handshake TCP+TLS contra Neon en
    // cada request. Con serverless, max alto daña porque cada instancia abre
    // su propio pool: 10 es el punto medio razonable.
    // Numero maximo de conexiones abiertas en este proceso.
    max: 10,
    // Cierra conexiones inactivas despues de 30 segundos.
    idleTimeoutMillis: 30_000,
    // Tiempo maximo esperando crear/obtener una conexion.
    connectionTimeoutMillis: 10_000,
    // Mantiene viva la conexion TCP para reducir reconexiones.
    keepAlive: true,
    // Espera inicial antes de activar keepAlive.
    keepAliveInitialDelayMillis: 10_000,
  });

// Sin listener, un error en una conexión idle (p.ej. Neon cerrando el socket)
// emite 'error' sin destino y tumba el proceso Node. Se absorbe y se loguea.
// Este listener evita que errores de conexiones idle tumben todo el servidor.
pool.on("error", (err) => {
  // Log minimo para diagnosticar el cierre de conexion.
  console.error("[db] error en conexión idle del pool:", err.message);
});

// El cacheo en global solo se mantiene fuera de producción: en producción
// cada instancia serverless conserva su propio pool.
// En desarrollo, guarda el pool para sobrevivir hot reload.
if (process.env.NODE_ENV !== "production") globalDb.__pool = pool;

// Export default para poder importar pool con cualquier nombre.
export default pool;
