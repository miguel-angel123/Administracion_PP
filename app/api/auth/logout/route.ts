// Cierre de sesión. Limpia la cookie SIEMPRE, incluso si la BD falla.
// NextResponse permite crear JSON y modificar cookies.
import { NextResponse } from "next/server";
// pool permite ejecutar UPDATE sobre PostgreSQL.
import pool from "@/lib/db";
// getSesion identifica al usuario actual usando la cookie token.
import { getSesion } from "@/lib/session";
// registrarLog guarda auditoria; LOG contiene tipos de evento.
import { registrarLog, LOG } from "@/lib/log";

// Handler POST de /api/auth/logout.
export async function POST() {
  try {
    // Obtiene sesion actual antes de borrar la cookie.
    const sesion = await getSesion();

    // Si habia sesion valida, registra logout y posibles cambios de estado.
    if (sesion) {
      // Inserta evento de cierre de sesion en logs.
      await registrarLog(sesion.doc, LOG.LOGOUT);

      // Efecto colateral simétrico al login: empleados vuelven a "descansando".
      // No aplica a gerente (estado permanente) ni a cliente (nunca fue activo).
      if (sesion.role === "empleado") {
        // Cambia estado del empleado a descansando.
        await pool.query(
          `UPDATE usuarios
           SET estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'descansando')
           WHERE documento = $1`,
          // Documento numerico requerido por la columna SQL.
          [Number(sesion.doc)]
        );
      }
    }
  } catch (e) {
    // Cualquier fallo de BD durante el logout es best-effort: la prioridad es
    // limpiar la cookie del navegador. Si el UPDATE de estado no se aplicó, el
    // empleado volverá a "trabajando" en su próximo login.
    // No se propaga: bloquear el logout por un timeout deja al usuario atrapado.
    // En produccion se evita imprimir detalles en consola.
    if (process.env.NODE_ENV !== "production") {
      console.error("[auth/logout] fallo no bloqueante:", e);
    }
  }

  // Respuesta positiva aunque el log/update haya fallado.
  const res = NextResponse.json({ ok: true });

  // Invalida la cookie sobrescribiéndola con una expiración en el pasado.
  res.cookies.set("token", "", {
    // Mantiene la misma propiedad que la cookie original.
    httpOnly: true,
    // Aplica a toda la app para borrar la cookie correcta.
    path: "/",
    // Fecha Unix inicial: hace que el navegador elimine la cookie.
    expires: new Date(0),
    // Debe coincidir con login: si un navegador ve sameSite distinto en el
    // Set-Cookie de borrado, puede ignorarlo y la cookie sobrevive.
    sameSite: "strict",
    // Mismo secure que login.
    secure: process.env.NODE_ENV === "production",
  });

  // Devuelve la respuesta con la cookie invalidada.
  return res;
}
