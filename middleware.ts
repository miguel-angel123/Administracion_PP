// Importa las utilidades del runtime de Next.js para middleware.
// NextResponse sirve para continuar, redirigir o responder JSON.
// NextRequest es sólo un tipo TypeScript que describe la petición entrante.
import { NextResponse, type NextRequest } from "next/server";

// Importa la función local que verifica si el JWT de sesión es válido.
import { verificarToken } from "@/lib/jwt";

// Define qué rutas puede visitar cada rol dentro de la aplicación.
// La clave es el nombre del rol y el valor es la lista de rutas permitidas.
const permitidos: Record<string, string[]> = {
  // El gerente tiene acceso a la mayoría de módulos administrativos.
  gerente: ["/", "/vehiculos", "/empleados", "/sugerencias", "/registros", "/estadisticas", "/tickets"],
  // El empleado puede operar el parqueadero, pero no administrar empleados ni registros.
  empleado: ["/", "/vehiculos", "/sugerencias", "/estadisticas", "/tickets"],
  // El cliente queda limitado a su perfil, tarifas y sugerencias.
  cliente: ["/perfil", "/tarifas", "/sugerencias"],
};

// Lógica de ruteo separada para poder medir duración sin duplicar el return.
async function manejar(req: NextRequest) {
  // Extrae la ruta solicitada, por ejemplo "/", "/vehiculos" o "/api/tickets".
  const { pathname } = req.nextUrl;

  // Permite pasar recursos internos de Next.js sin aplicar reglas de negocio.
  if (pathname.startsWith("/_next")) {
    // NextResponse.next() significa: "continúa con el flujo normal".
    return NextResponse.next();
  }

  // Aplica protección CSRF sólo a APIs que modifican datos.
  if (
    // La regla sólo aplica a rutas que empiezan por /api.
    pathname.startsWith("/api") &&
    // Estos métodos pueden cambiar información en el servidor.
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
    // Login queda excluido porque todavía no hay sesión previa.
    !pathname.startsWith("/api/auth/login") &&
    // La ruta que entrega la cookie CSRF también queda excluida.
    !pathname.startsWith("/api/csrf")
  ) {
    // Lee el token CSRF enviado por el frontend en el header.
    const header = req.headers.get("x-csrf-token");
    // Lee el token CSRF guardado como cookie del navegador.
    const cookie = req.cookies.get("csrf")?.value;
    // Si falta alguno o son diferentes, se bloquea la petición.
    if (!header || !cookie || header !== cookie) {
      // Devuelve HTTP 403 porque la petición no cumple la protección CSRF.
      return NextResponse.json({ error: "CSRF inválido" }, { status: 403 });
    }
  }

  // Las APIs pasan después del chequeo CSRF.
  // La autenticación específica de cada API se valida dentro de su route.ts.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Lee la cookie de sesión donde se guarda el JWT.
  const token = req.cookies.get("token")?.value;
  // Si no hay token, deja pasar: el AuthGate mostrará login en el cliente.
  if (!token) return NextResponse.next();

  // Valida firma, expiración y contenido básico del JWT.
  const payload = await verificarToken(token);
  // Si el token es inválido, deja pasar como usuario no autenticado.
  if (!payload) return NextResponse.next();

  // Busca las rutas permitidas para el rol que venía dentro del token.
  const rutas = permitidos[payload.role] || [];
  // Una ruta es válida si coincide exacto o si es una subruta permitida.
  const permitida = rutas.some(r => pathname === r || pathname.startsWith(r + "/"));

  // Si el usuario autenticado intenta entrar a una ruta no autorizada, se redirige.
  if (!permitida) {
    // Los clientes se mandan a su perfil; empleados y gerente al dashboard.
    const destino = payload.role === "cliente" ? "/perfil" : "/";
    // Construye una URL absoluta basada en la URL original de la petición.
    return NextResponse.redirect(new URL(destino, req.url));
  }

  // Si pasó todas las validaciones, Next continúa con la página solicitada.
  return NextResponse.next();
}

// Middleware público: mide la latencia total del request y la publica en
// Server-Timing (visible en DevTools → Network → Headers).
export async function middleware(req: NextRequest) {
  // Guarda el tiempo inicial antes de aplicar las reglas.
  const inicio = performance.now();
  // Ejecuta la lógica principal del middleware.
  const res = await manejar(req);
  // Calcula cuánto tiempo tomó procesar esta petición.
  const duracion = performance.now() - inicio;
  // Agrega la duración al header Server-Timing para inspeccionarla en DevTools.
  res.headers.set("Server-Timing", `total;dur=${duracion.toFixed(2)}`);
  // Devuelve la respuesta final: continuar, redirigir o bloquear.
  return res;
}

// Configura en qué rutas se ejecuta este middleware.
export const config = {
  // Aplica a casi todo, excepto assets internos, imágenes de Next y favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
