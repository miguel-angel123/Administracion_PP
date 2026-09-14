// Endpoint de autenticación. Emite la cookie httpOnly con el JWT firmado.
// NextResponse crea respuestas JSON y permite setear cookies.
import { NextResponse } from "next/server";
// bcrypt compara la contrasena escrita contra el hash guardado.
import bcrypt from "bcryptjs";
// ensureSeed prepara datos minimos si la base todavia no esta lista.
import { ensureSeed } from "@/lib/seed";
// pool es la conexion compartida a PostgreSQL.
import pool from "@/lib/db";
// firmarToken crea el JWT de sesion.
import { firmarToken } from "@/lib/jwt";
// registrarLog guarda auditoria; LOG contiene nombres estandar de eventos.
import { registrarLog, LOG } from "@/lib/log";
// respuestaError estandariza errores de base de datos/servidor.
import { respuestaError } from "@/lib/erroresHttp";

// Handler POST de /api/auth/login.
export async function POST(req: Request) {
  try {
    // Garantiza que existan datos mínimos (roles, estados, usuarios demo) antes de autenticar.
    await ensureSeed();

    // Lee el cuerpo JSON enviado por LoginPage.
    const { doc, password } = await req.json();

    // Consulta al usuario junto con su rol y estado.
    // Se filtra por no-eliminado y por estado distinto de "inactivo" para bloquear cuentas deshabilitadas.
    const result = await pool.query(
      // Busca usuario por documento y trae hash, rol y estado en una sola consulta.
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
      // El documento se pasa como parametro para prevenir inyeccion SQL.
      [Number(doc)]
    );

    // Mensaje uniforme para no revelar si el documento existe o no (evita enumeración de usuarios).
    if (!result.rows.length) {
      // No dice "usuario no existe" para no filtrar informacion.
      return NextResponse.json(
        { ok: false, error: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    // Compara la contraseña en texto plano contra el hash almacenado.
    // bcrypt.compare internamente aplica sal/hash y devuelve true o false.
    const passwordCorrecta = await bcrypt.compare(password, result.rows[0].hash);

    // Si la contrasena no coincide, responde igual que cuando no existe usuario.
    if (!passwordCorrecta) {
      return NextResponse.json(
        { ok: false, error: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    // Guarda la fila encontrada en una variable con nombre mas claro.
    const userData = result.rows[0];

    // Efecto colateral: al iniciar sesión, los empleados pasan automáticamente a "trabajando".
    // Esto alimenta los indicadores del dashboard sin intervención manual.
    if (userData.role === "empleado") {
      // Cambia el estado del empleado a trabajando cuando inicia sesion.
      await pool.query(
        `UPDATE usuarios
         SET estados_id_estado = (SELECT id_estado FROM estados WHERE nombre_estado = 'trabajando')
         WHERE documento = $1`,
        // Documento del empleado autenticado.
        [userData.documento]
      );
    }

    // Objeto público que se devuelve al cliente (nunca incluye hash).
    const user = {
      // id se conserva numerico para compatibilidad con el tipo del frontend.
      id: userData.documento,
      // doc se convierte a string para cookies/JWT y componentes.
      doc: String(userData.documento),
      // Nombre visible en sidebar y sesion.
      name: userData.nombre,
      // Rol usado por navegacion y permisos.
      role: userData.role,
      // Correo publico del usuario.
      email: userData.correo,
      // Telefono publico del usuario.
      phone: userData.telefono,
      // Estado consultado antes del posible cambio a trabajando.
      estado: userData.estado,
    };

    // Firma del JWT con documento (subject) y rol.
    const token = await firmarToken(user.doc, user.role);

    // Registro del evento de login en el historial del sistema.
    await registrarLog(user.doc, LOG.LOGIN);

    // Crea la respuesta exitosa que se enviara al frontend.
    const res = NextResponse.json({ ok: true, user });

    // Cookie httpOnly: el navegador no puede leerla desde JS (mitiga XSS).
    // sameSite lax permite navegación normal; secure solo en producción (HTTPS).
    res.cookies.set("token", token, {
      // Impide que JavaScript del navegador lea el JWT.
      httpOnly: true,
      // En produccion exige HTTPS.
      secure: process.env.NODE_ENV === "production",
      // Reduce envio en contextos cross-site.
      sameSite: "lax",
      // Ocho horas en segundos.
      maxAge: 60 * 60 * 8,
      // Cookie disponible en toda la app.
      path: "/",
    });

    // Devuelve JSON y cookie al navegador.
    return res;
  } catch (e) {
    // respuestaError clasifica timeout de Neon (→ 503) y deadlock (→ 409) por
    // separado del resto (→ 500). lib/auth.tsx ya maneja ambos códigos.
    // El prefijo aporta contexto propio del endpoint al log del servidor.
    console.error("[auth/login]", e);
    // Convierte el error a respuesta HTTP controlada.
    return respuestaError(e);
  }
}
