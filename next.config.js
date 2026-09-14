// Indica al editor que este archivo usa el tipo oficial de configuración de Next.js.
/** @type {import('next').NextConfig} */

// Objeto principal de configuración que Next.js lee al iniciar o compilar.
const nextConfig = {
  // Mantiene "pg" como paquete externo del servidor.
  // Esto evita que Next intente empaquetar el cliente de PostgreSQL para el navegador.
  serverExternalPackages: ["pg"],
};

// Exporta la configuración usando CommonJS, formato aceptado por next.config.js.
module.exports = nextConfig;
