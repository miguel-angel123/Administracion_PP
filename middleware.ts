import { NextResponse, type NextRequest } from "next/server";
import { verificarToken } from "@/lib/jwt";

const permitidos: Record<string, string[]> = {
  gerente: ["/", "/vehiculos", "/empleados", "/sugerencias", "/registros", "/estadisticas", "/tickets"],
  empleado: ["/", "/vehiculos", "/sugerencias", "/estadisticas", "/tickets"],
  cliente: ["/perfil", "/tarifas", "/sugerencias"],
};

// Lógica de ruteo separada para poder medir duración sin duplicar el return.
async function manejar(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/api") &&
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
    !pathname.startsWith("/api/auth/login") &&
    !pathname.startsWith("/api/csrf")
  ) {
    const header = req.headers.get("x-csrf-token");
    const cookie = req.cookies.get("csrf")?.value;
    if (!header || !cookie || header !== cookie) {
      return NextResponse.json({ error: "CSRF inválido" }, { status: 403 });
    }
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("token")?.value;
  if (!token) return NextResponse.next();

  const payload = await verificarToken(token);
  if (!payload) return NextResponse.next();

  const rutas = permitidos[payload.role] || [];
  const permitida = rutas.some(r => pathname === r || pathname.startsWith(r + "/"));

  if (!permitida) {
    const destino = payload.role === "cliente" ? "/perfil" : "/";
    return NextResponse.redirect(new URL(destino, req.url));
  }

  return NextResponse.next();
}

// Middleware público: mide la latencia total del request y la publica en
// Server-Timing (visible en DevTools → Network → Headers).
export async function middleware(req: NextRequest) {
  const inicio = performance.now();
  const res = await manejar(req);
  const duracion = performance.now() - inicio;
  res.headers.set("Server-Timing", `total;dur=${duracion.toFixed(2)}`);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
