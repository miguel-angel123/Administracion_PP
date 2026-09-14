// Firma y verificación de JWT usando jose (compatible con Node y Edge).
// El token nunca se expone al cliente: viaja en cookie httpOnly.
// SignJWT crea tokens; jwtVerify valida firma y expiracion.
import { SignJWT, jwtVerify } from "jose";

// Vida útil del token. Debe coincidir con maxAge de la cookie emitida en el login.
const EXPIRES_IN = "8h";

// Devuelve la clave secreta en el formato que exige jose.
// Se lanza si no está definida: firmar con una clave por defecto es inseguro.
function getSecret() {
  // Lee la variable de entorno definida en .env o en el proveedor de hosting.
  const secret = process.env.JWT_SECRET;
  // Sin secreto no se puede firmar ni verificar de forma segura.
  if (!secret) throw new Error("JWT_SECRET no está definido");
  // jose espera la clave como Uint8Array; TextEncoder convierte string a bytes.
  return new TextEncoder().encode(secret);
}

// Emite un token firmado con HS256.
// - setSubject: el documento del usuario (identificador estable).
// - payload { role }: usado por getSesion() y las rutas para decidir permisos.
export async function firmarToken(doc: string, role: string) {
  // El payload publico contiene el rol.
  return new SignJWT({ role })
    // Header protegido: algoritmo HMAC SHA-256.
    .setProtectedHeader({ alg: "HS256" })
    // Subject del JWT: documento del usuario.
    .setSubject(doc)
    // Fecha/hora de emision del token.
    .setIssuedAt()
    // Fecha/hora de expiracion relativa.
    .setExpirationTime(EXPIRES_IN)
    // Firma final usando la clave secreta.
    .sign(getSecret());
}

// Verifica la firma y la expiración. Si algo falla, devuelve null (equivale a "sin sesión").
// Exige que el token traiga subject y role: cualquier token sin ellos se considera inválido.
export async function verificarToken(token: string) {
  try {
    // jwtVerify valida firma, estructura y expiracion.
    const { payload } = await jwtVerify(token, getSecret());
    // Sin sub o role el backend no puede identificar ni autorizar al usuario.
    if (!payload.sub || !payload.role) return null;
    // Normaliza ambos campos como string para uso consistente en la app.
    return {
      doc: String(payload.sub),
      role: String(payload.role),
    };
  } catch {
    // Cualquier error significa token invalido o expirado.
    return null;
  }
}
