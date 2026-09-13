"use client";

// Estado global de la conexión en vivo. Sin Context: lo escribe apiClient y
// useLiveData, lo lee el banner. useSyncExternalStore exige que getSnapshot
// devuelva LA MISMA referencia mientras no haya transición, así que el objeto
// se reemplaza (frozen) sólo cuando cambia algo.
//
// Forma elegida para no sobre-ingenierizar: `conectado` es el estado sano;
// `reintentando` es aviso suave (SSE caído, polling de respaldo activo);
// `caido` es error duro (varios 5xx/red seguidos), el único con acción manual
// útil además del auto-retry.

export type EstadoConexion = "conectado" | "reintentando" | "caido";

export interface Snapshot {
  estado: EstadoConexion;
  error: string | null;
}

let snapshot: Snapshot = Object.freeze({ estado: "conectado", error: null });
const oyentes = new Set<() => void>();

export function getSnapshot(): Snapshot {
  return snapshot;
}

export function setEstadoConexion(
  estado: EstadoConexion,
  error: string | null = null
) {
  if (snapshot.estado === estado && snapshot.error === error) return;
  snapshot = Object.freeze({ estado, error });
  oyentes.forEach(fn => fn());
}

export function suscribirEstado(fn: () => void) {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}
