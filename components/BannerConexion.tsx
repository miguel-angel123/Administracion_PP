"use client";

import { useSyncExternalStore } from "react";
import { getSnapshot, suscribirEstado } from "@/lib/live/estadoConexion";
import { C } from "@/lib/tema";

export default function BannerConexion() {
  const { estado, error } = useSyncExternalStore(
    suscribirEstado,
    getSnapshot,
    getSnapshot
  );

  if (estado === "conectado") return null;

  const suave = estado === "reintentando";
  const borde = suave ? C.gold : "#EF4444";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "8px 16px",
        // Color sólido: sin transparencia, el banner tapa lo de abajo en
        // cualquier estado. Texto y botón en blanco para contraste.
        background: borde,
        borderBottom: `1px solid ${borde}`,
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span>{suave ? "Reconectando con el servidor…" : error ?? "Sin conexión con el servidor"}</span>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("live-reconnect"))}
        style={{
          padding: "3px 10px",
          borderRadius: 6,
          border: "1px solid rgba(255, 255, 255, 0.55)",
          background: "rgba(255, 255, 255, 0.18)",
          color: "#FFFFFF",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Reconectar
      </button>
    </div>
  );
}
