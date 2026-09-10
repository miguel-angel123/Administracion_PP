// Cliente PostgreSQL compartido por todo el backend.
// Todas las consultas de modelos y controladores deben pasar por este pool.
import { Pool } from "pg";

// Cadena de conexión que viene del .env. Si falta, se falla rápido y no se levanta la app.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida en el archivo .env");
}

// Guarda el pool en globalThis para que el hot-reload de Next no cree pools nuevos
// en cada recompilación en desarrollo (evita agotar el límite de conexiones).
const globalDb = globalThis as unknown as { __pool?: Pool };

export const pool =
  globalDb.__pool ??
  new Pool({
    connectionString,
    // Neon y otros Postgres gestionados requieren SSL.
    // En local (localhost) se desactiva para no exigir certificados.
    ssl: connectionString.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
    // Un pool chico y caliente evita pagar handshake TCP+TLS contra Neon en
    // cada request. Con serverless, max alto daña porque cada instancia abre
    // su propio pool: 10 es el punto medio razonable.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

// El cacheo en global solo se mantiene fuera de producción: en producción
// cada instancia serverless conserva su propio pool.
if (process.env.NODE_ENV !== "production") globalDb.__pool = pool;

export default pool;
