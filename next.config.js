// Indica al editor que este archivo usa el tipo oficial de configuración de Next.js.
/** @type {import('next').NextConfig} */

// Objeto principal de configuración que Next.js lee al iniciar o compilar.
const nextConfig = {
  // Mantiene "pg" como paquete externo del servidor.
  // Esto evita que Next intente empaquetar el cliente de PostgreSQL para el navegador.
  serverExternalPackages: ["pg"],

  // Headers seguros que NO dependen de HTTPS ni tocan el runtime de Next.
  // Aplican igual en dev y en producción.
  //
  // Fuera de este bloque a propósito:
  //   - Strict-Transport-Security: el navegador ignora HSTS sobre http://localhost.
  //   - Content-Security-Policy: rompe eval/unsafe-inline del HMR de Next dev.
  //   - Permissions-Policy: sin caso de uso en la app; se añade en producción
  //     si se requiere endurecer micrófono/cámara/geolocalización.
  // Checklist completo en docs/seguridad-produccion.md.
  async headers() {
    return [
      {
        // Toda la app. El matcher de middleware.ts ya excluye _next/static
        // y favicon.ico antes de aplicar reglas de negocio.
        source: "/:path*",
        headers: [
          // El navegador no adivina el Content-Type: sin esto, un .json
          // servido como text/plain puede interpretarse como script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Bloquea el encuadre en <iframe>. Evita clickjacking sin depender
          // de CSP frame-ancestors (que en dev no se puede aplicar).
          { key: "X-Frame-Options", value: "DENY" },
          // Limita el Referer. El nivel strict-origin-when-cross-origin evita
          // filtrar rutas con IDs (p. ej. /perfil o /api/.../123) a terceros.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

// Exporta la configuración usando CommonJS, formato aceptado por next.config.js.
module.exports = nextConfig;
