import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ensureSeed } from "@/lib/seed";
import pool from "@/lib/db";
import { firmarToken } from "@/lib/jwt";
import { registrarLog } from "@/lib/log";

export async function POST(req: Request) {
  try {
    await ensureSeed();

    const { doc, password } = await req.json();

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

    if (!result.rows.length) {
      return NextResponse.json(
        { ok: false, error: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    const passwordCorrecta = await bcrypt.compare(password, result.rows[0].hash);

    if (!passwordCorrecta) {
      return NextResponse.json(
        { ok: false, error: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    const userData = result.rows[0];

    if (userData.role === "empleado") {
      await pool.query(
        `UPDATE usuarios
         SET estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'trabajando')
         WHERE documento = $1`,
        [userData.documento]
      );
    }

    const user = {
      id: userData.documento,
      doc: String(userData.documento),
      name: userData.nombre,
      role: userData.role,
      email: userData.correo,
      phone: userData.telefono,
      estado: userData.estado,
    };

    const token = await firmarToken(user.doc, user.role);

    await registrarLog(user.doc, "LOGIN");

    const res = NextResponse.json({ ok: true, user });

    res.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return res;
  } catch (e) {
    console.error("Error en POST /api/auth/login:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo conectar con la base de datos. Verifica DATABASE_URL y la conexión de red." },
      { status: 500 }
    );
  }
}
