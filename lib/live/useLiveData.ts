"use client";

import { useEffect, useRef } from "react";
import { setEstadoConexion } from "./estadoConexion";

const MAX_FALLOS = 3;

// Polling condicional por versión global.
//
//   - Montaje: fija la versión base ANTES de cargar y ejecuta `cargar()` una
//     sola vez. Cualquier cambio concurrente queda por encima de la base y se
//     detecta en el siguiente tick: no se pierde.
//   - Intervalo: GET /api/version. Si cambió, ejecuta `cargar()`. Si no,
//     no toca la BD pesada.
//
// Al montar el hook NO se re-invoca con cada render: `cargar` entra en deps
// (como hacía useEffect(load, [load]) en cada page). Cambios de filtro o
// página reinician el ciclo y refetchean una única vez.
//
// Matriz de errores:
//   401            → dispatch("sesion-expirada")
//   5xx / red      → silencio; 3 seguidos → banner
//   200 sin cambios  → nada
//   200 con cambios  → cargar()
export function useLiveData(
  cargar: () => void | Promise<void>,
  intervalMs = 5000
) {
  const ref = useRef(cargar);
  ref.current = cargar;

  useEffect(() => {
    let activo = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let version: number | null = null;
    let fallos = 0;

    const leerVersion = async (): Promise<number | null> => {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (res.status === 401) {
        window.dispatchEvent(new Event("sesion-expirada"));
        return null;
      }
      if (!res.ok) throw new Error(`version ${res.status}`);
      const data = (await res.json()) as { version?: number };
      return typeof data.version === "number" ? data.version : null;
    };

    const registrarFallo = () => {
      fallos += 1;
      if (fallos >= MAX_FALLOS) {
        setEstadoConexion("caido", "No se pudo conectar con el servidor.");
      } else {
        setEstadoConexion("reintentando", null);
      }
    };

    const tick = async () => {
      if (!activo || document.visibilityState !== "visible") return;
      try {
        const nueva = await leerVersion();
        if (!activo || nueva === null) return;
        if (fallos > 0) { fallos = 0; setEstadoConexion("conectado", null); }
        if (version !== null && nueva !== version) {
          await ref.current();
        }
        version = nueva;
      } catch {
        if (activo) registrarFallo();
      }
    };

    const arranque = async () => {
      try {
        // Base ANTES de cargar: si un cambio se comete mientras carga, el
        // primer tick lo ve (nueva !== base) y refetchea.
        version = await leerVersion();
        if (!activo) return;
        await ref.current();
        if (!activo) return;
        fallos = 0;
        setEstadoConexion("conectado", null);
      } catch {
        if (activo) registrarFallo();
      }
    };

    const reiniciar = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => void tick(), intervalMs);
    };

    const onVisibilidad = () => {
      if (document.visibilityState === "visible") {
        void tick();
        reiniciar();
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onReconectar = () => {
      fallos = 0;
      setEstadoConexion("conectado", null);
      void tick();
    };

    void arranque().then(() => {
      if (activo) reiniciar();
    });
    document.addEventListener("visibilitychange", onVisibilidad);
    window.addEventListener("live-reconnect", onReconectar);

    return () => {
      activo = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilidad);
      window.removeEventListener("live-reconnect", onReconectar);
    };
  }, [cargar, intervalMs]);
}
