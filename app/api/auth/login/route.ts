// Endpoint de autenticación. Emite la cookie httpOnly con el JWT firmado.
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ensureSeed } from "@/lib/seed";
import pool from "@/lib/db";
import { firmarToken } from "@/lib/jwt";
import { registrarLog } from "@/lib/log";

export async function POST(req: Request) {
  try {
    // Garantiza que existan datos mínimos (roles, estados, usuarios demo) antes de autenticar.
    await ensureSeed();

    const { doc, password } = await req.json();

    // Consulta al usuario junto con su rol y estado.
    // Se filtra por no-eliminado y por estado distinto de "inactivo" para bloquear cuentas deshabilitadas.
    const result = await pool.query(
      `SELECT
         u.documento,
         u.nombre,
         u.correo,
         u.telefono,
         u.contraseña AS hash,
         r.nombre_rol AS role,
         e.nombre_estado AS estado
       FROM usuarios u
       JOIN roles r ON r.id_roles = u.roles_id_roles
       JOIN estados e ON e.id_estado = u.estados_id_estado
       WHERE u.documento = $1
         AND u.fecha_eliminado IS NULL
         AND e.nombre_estado <> 'inactivo'`,
      [Number(doc)]
    );

    // Mensaje uniforme para no revelar si el documento existe o no (evita enumeración de usuarios).
    if (!result.rows.length) {
      return NextResponse.json(
        { ok: false, error: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    // Compara la contraseña en texto plano contra el hash almacenado.
    const passwordCorrecta = await bcrypt.compare(password, result.rows[0].hash);

    if (!passwordCorrecta) {
      return NextResponse.json(
        { ok: false, error: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    const userData = result.rows[0];

    // Efecto colateral: al iniciar sesión, los empleados pasan automáticamente a "trabajando".
    // Esto alimenta los indicadores del dashboard sin intervención manual.
    if (userData.role === "empleado") {
      await pool.query(
        `UPDATE usuarios
         SET estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'trabajando')
         WHERE documento = $1`,
        [userData.documento]
      );
    }

    // Objeto público que se devuelve al cliente (nunca incluye hash).
    const user = {
      id: userData.documento,
      doc: String(userData.documento),
      name: userData.nombre,
      role: userData.role,
      email: userData.correo,
      phone: userData.telefono,
      estado: userData.estado,
    };

    // Firma del JWT con documento (subject) y rol.
    const token = await firmarToken(user.doc, user.role);

    // Registro del evento de login en el historial del sistema.
    await registrarLog(user.doc, "LOGIN");

    const res = NextResponse.json({ ok: true, user });

    // Cookie httpOnly: el navegador no puede leerla desde JS (mitiga XSS).
    // sameSite lax permite navegación normal; secure solo en producción (HTTPS).
    res.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return res;
  } catch (e) {
    // Cualquier fallo (parseo, BD, etc.) se reporta con un mensaje genérico y status 500.
    console.error("Error en POST /api/auth/login:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo conectar con la base de datos. Verifica DATABASE_URL y la conexión de red." },
      { status: 500 }
    );
  }
}
