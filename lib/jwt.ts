// Firma y verificación de JWT usando jose (compatible con Node y Edge).
// El token nunca se expone al cliente: viaja en cookie httpOnly.
import { SignJWT, jwtVerify } from "jose";

// Vida útil del token. Debe coincidir con maxAge de la cookie emitida en el login.
const EXPIRES_IN = "8h";

// Devuelve la clave secreta en el formato que exige jose.
// Se lanza si no está definida: firmar con una clave por defecto es inseguro.
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET no está definido");
  return new TextEncoder().encode(secret);
}

// Emite un token firmado con HS256.
// - setSubject: el documento del usuario (identificador estable).
// - payload { role }: usado por getSesion() y las rutas para decidir permisos.
export async function firmarToken(doc: string, role: string) {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(doc)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(getSecret());
}

// Verifica la firma y la expiración. Si algo falla, devuelve null (equivale a "sin sesión").
// Exige que el token traiga subject y role: cualquier token sin ellos se considera inválido.
export async function verificarToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || !payload.role) return null;
    return {
      doc: String(payload.sub),
      role: String(payload.role),
    };
  } catch {
    return null;
  }
}
