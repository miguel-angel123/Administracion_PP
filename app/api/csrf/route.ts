// NextResponse permite devolver JSON y configurar cookies.
import { NextResponse } from "next/server";

// randomBytes genera bytes criptograficamente aleatorios desde Node.js.
import { randomBytes } from "crypto";

// Endpoint GET que crea o renueva el token CSRF del navegador.
export async function GET() {
  // Genera 32 bytes aleatorios y los convierte a hexadecimal.
  const token = randomBytes(32).toString("hex");

  // Devuelve el token tambien en JSON por si el cliente quisiera leerlo.
  const res = NextResponse.json({ token });

  // Guarda el mismo token en una cookie llamada csrf.
  res.cookies.set("csrf", token, {
    // false porque fetchSeguro necesita leer esta cookie desde document.cookie.
    httpOnly: false,
    // lax reduce riesgo CSRF en navegacion externa sin romper uso normal.
    sameSite: "lax",
    // secure solo en produccion, donde se espera HTTPS.
    secure: process.env.NODE_ENV === "production",
    // Disponible para toda la aplicacion.
    path: "/",
    // Caduca junto con la sesion aproximada de 8 horas.
    maxAge: 60 * 60 * 8,
  });

  // Devuelve la respuesta con JSON y cookie.
  return res;
}
