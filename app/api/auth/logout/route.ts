// Cierre de sesión. Limpia la cookie y revierte el estado del empleado.
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSesion } from "@/lib/session";

export async function POST() {
  const sesion = await getSesion();

  // Efecto colateral simétrico al login: si el usuario era empleado,
  // pasa a "descansando" al cerrar sesión.
  if (sesion?.role === "empleado") {
    await pool.query(
      `UPDATE usuarios
       SET estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'descansando')
       WHERE documento = $1`,
      [Number(sesion.doc)]
    );
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
