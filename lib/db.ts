import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida en el archivo .env");
}

const globalDb = globalThis as unknown as { __pool?: Pool };

export const pool =
  globalDb.__pool ??
  new Pool({
    connectionString,
    ssl: connectionString.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") globalDb.__pool = pool;

export default pool;
