// Cierre de sesión. Limpia la cookie SIEMPRE, incluso si la BD falla.
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSesion } from "@/lib/session";
import { registrarLog, LOG } from "@/lib/log";

export async function POST() {
  try {
    const sesion = await getSesion();

    if (sesion) {
      await registrarLog(sesion.doc, LOG.LOGOUT);

      // Efecto colateral simétrico al login: empleados vuelven a "descansando".
      // No aplica a gerente (estado permanente) ni a cliente (nunca fue activo).
      if (sesion.role === "empleado") {
        await pool.query(
          `UPDATE usuarios
           SET estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'descansando')
           WHERE documento = $1`,
          [Number(sesion.doc)]
        );
      }
    }
  } catch (e) {
    // Cualquier fallo de BD durante el logout es best-effort: la prioridad es
    // limpiar la cookie del navegador. Si el UPDATE de estado no se aplicó, el
    // empleado volverá a "trabajando" en su próximo login.
    // No se propaga: bloquear el logout por un timeout deja al usuario atrapado.
    if (process.env.NODE_ENV !== "production") {
      console.error("[auth/logout] fallo no bloqueante:", e);
    }
  }

  const res = NextResponse.json({ ok: true });

  // Invalida la cookie sobrescribiéndola con una expiración en el pasado.
  res.cookies.set("token", "", {
    httpOnly: true,
    path: "/",
    expires: new Date(0),
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}
