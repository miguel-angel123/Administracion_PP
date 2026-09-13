"use client";

// Cliente HTTP central. Une tres cosas que antes vivían dispersas en cada page:
//   1. Detección de 401 → evento global "sesion-expirada" (un solo logout).
//   2. Resiliencia: 3 fallos seguidos de red/5xx levantan el banner. Un fallo
//      aislado no molesta al operador.
//   3. Deduplicación por hash: si el payload es idéntico al último, se
//      devuelve `sinCambios` y la página evita el setState/re-render.
import { setEstadoConexion } from "./estadoConexion";

// Hash por URL. Sólo el último payload: no hace falta historial.
const cache = new Map<string, string>();

// Fallos consecutivos globales (cualquier URL). El umbral es 3 para que un
// timeout puntual de Neon no dispare el banner.
let fallosSeguidos = 0;
const UMBRAL_FALLOS = 3;

// FNV-1a 32 bits. Detecta "cambió/no cambió" en payloads de cientos de filas.
// No es criptográfico y no pretende serlo.
function hash(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export interface Respuesta<T> {
  data?: T;
  sinCambios?: boolean;
  expirada?: boolean;
  error?: "silencioso" | "persistente";
}

export async function clienteFetch<T = unknown>(
  url: string,
  init?: RequestInit,
  // Clave de cache. Por defecto la URL completa, incluido el query string: dos
  // páginas con filtros distintos no comparten hash.
  claveHash: string = url
): Promise<Respuesta<T>> {
  let res: Response;

  try {
    res = await fetch(url, init);
  } catch {
    // Red caída o CORS. Mismo tratamiento que 5xx.
    return registrarFallo("Sin conexión con el servidor");
  }

  if (res.status === 401) {
    // Sesión expirada o revocada en otra pestaña. Un único listener en
    // AuthProvider hace logout(); el AuthGate se encarga del redirect.
    window.dispatchEvent(new Event("sesion-expirada"));
    return { expirada: true };
  }

  if (!res.ok) {
    return registrarFallo(`El servidor respondió ${res.status}`);
  }

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    // Cuerpo no-JSON (página de error HTML de Next, por ejemplo).
    return registrarFallo("Respuesta inválida del servidor");
  }

  fallosSeguidos = 0;
  setEstadoConexion("conectado");

  const h = hash(JSON.stringify(data));
  if (cache.get(claveHash) === h) {
    return { sinCambios: true };
  }

  cache.set(claveHash, h);
  return { data };
}

function registrarFallo(mensaje: string): Respuesta<never> {
  fallosSeguidos += 1;

  if (fallosSeguidos >= UMBRAL_FALLOS) {
    setEstadoConexion("caido", mensaje);
    return { error: "persistente" };
  }

  return { error: "silencioso" };
}
