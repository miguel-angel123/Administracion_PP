const { Client } = require("pg");

process.loadEnvFile?.(".env");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

const u = new URL(url);
console.log("Host:", u.hostname);
console.log("Puerto:", u.port || "5432");
console.log("Base de datos:", u.pathname.slice(1));
console.log("Usuario:", decodeURIComponent(u.username));

const client = new Client({
  connectionString: url,
  ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
});

client
  .connect()
  .then(() => {
    console.log("Conexión OK ✅");
    return client.end();
  })
  .catch((e) => {
    console.error("Error:", e.code, e.message);
    process.exit(1);
  });
