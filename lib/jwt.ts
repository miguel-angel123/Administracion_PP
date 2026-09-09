import { SignJWT, jwtVerify } from "jose";

const EXPIRES_IN = "8h";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET no está definido");
  return new TextEncoder().encode(secret);
}

export async function firmarToken(doc: string, role: string) {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(doc)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(getSecret());
}

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
