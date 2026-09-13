// Traduce cualquier throw de un route handler a la respuesta JSON correcta.
// Sin esto, una excepción lanzada ANTES del try (caso típico: getSesion contra
// Neon) escapaba al manejador de Next, que devuelve su página de error HTML.
// El frontend hacía res.json() sobre ese HTML y moría con
// "JSON.parse: unexpected end of data" en vez de mostrar el error real.
import { NextResponse } from "next/server";
import { ErrorDominio } from "@/lib/models/errores";

export function respuestaError(e: unknown) {
  // 40P01 (deadlock). No es bug del request: dos transacciones tomaron locks
  // cruzados y Postgres abortó una. Se reporta 409 para que el operador
  // reintente, en vez del 500 opaco que saldría del catch genérico.
  if (esDeadlock(e)) {
    return NextResponse.json(
      { error: "Otro operador está usando el mismo recurso. Reintente." },
      { status: 409 }
    );
  }

  const status = e instanceof ErrorDominio ? e.status : esTimeout(e) ? 503 : 500;

  let mensaje: string;
  if (e instanceof ErrorDominio) {
    mensaje = e.message;                       // controlado, seguro
  } else if (esTimeout(e)) {
    mensaje = "La base de datos no respondió a tiempo. Intenta de nuevo.";
  } else {
    // Error de infraestructura (PG, Neon, socket) o bug: se loguea completo
    // en servidor, pero al cliente solo llega un mensaje neutro. Un throw
    // crudo de pg expone nombre de constraint, query, o detalles de Neon.
    console.error("[api] error no controlado:", e);
    mensaje = "Error interno del servidor";
  }

  return NextResponse.json({ error: mensaje }, { status });
}

// Neon puede tardar más que el connectionTimeoutMillis del pool (10 s).
// Un timeout de infraestructura no es un bug del request: es 503, no 500.
//
// pg lanza AggregateError cuando fallan varios sockets a la vez (pool
// reconectando tras auto-suspend). El .code queda dentro de .errors[i],
// no en el nivel superior. Hay que recorrer el árbol.
function esTimeout(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;

  const err = e as { code?: string; errors?: unknown[] };

  if (err.code === "ETIMEDOUT" || err.code === "ECONNRESET" || err.code === "ECONNREFUSED") {
    return true;
  }

  if (Array.isArray(err.errors)) {
    return err.errors.some(esTimeout);
  }

  return false;
}

// 40P01 (deadlock_detected). Mismo tratamiento que esTimeout: pg puede
// envolverlo en AggregateError al venir de una conexión reciclada del pool.
function esDeadlock(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;

  const err = e as { code?: string; errors?: unknown[] };

  if (err.code === "40P01") return true;

  if (Array.isArray(err.errors)) {
    return err.errors.some(esDeadlock);
  }

  return false;
}
