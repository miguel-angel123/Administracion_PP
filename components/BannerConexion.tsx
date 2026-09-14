// Marca el archivo como componente de cliente porque usa hooks y window.
"use client";

// useSyncExternalStore conecta React con un store externo de forma segura.
import { useSyncExternalStore } from "react";

// getSnapshot lee el estado actual de conexion; suscribirEstado registra listeners.
import { getSnapshot, suscribirEstado } from "@/lib/live/estadoConexion";

// Paleta central del sistema.
import { C } from "@/lib/tema";

// Componente que muestra una franja superior cuando hay problemas de conexion.
export default function BannerConexion() {
  // Se suscribe al store externo y obtiene estado/error actuales.
  const { estado, error } = useSyncExternalStore(
    // Funcion para suscribirse a cambios.
    suscribirEstado,
    // Snapshot usado en el navegador.
    getSnapshot,
    // Snapshot usado como fallback para renderizado inicial.
    getSnapshot
  );

  // Si todo esta conectado, no renderiza nada.
  if (estado === "conectado") return null;

  // "suave" indica que no es fallo total, sino reintento de conexion.
  const suave = estado === "reintentando";
  // Color amarillo para reintento; rojo para error fuerte.
  const borde = suave ? C.gold : "#EF4444";

  // Renderiza el banner fijo en la parte superior.
  return (
    <div
      // role status anuncia cambios no criticos a tecnologias asistivas.
      role="status"
      // aria-live polite avisa el cambio sin interrumpir agresivamente.
      aria-live="polite"
      style={{
        // El banner queda fijo arriba aunque la pagina tenga scroll.
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        // zIndex alto para quedar por encima del contenido normal.
        zIndex: 1000,
        // Flex centra el mensaje y el boton.
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
      {/* Mensaje dinamico segun el estado de conexion. */}
      <span>{suave ? "Reconectando con el servidor…" : error ?? "Sin conexión con el servidor"}</span>
      {/* Boton manual para pedir una reconexion. */}
      <button
        type="button"
        // Dispara un evento global que escucha la capa live.
        onClick={() => window.dispatchEvent(new Event("live-reconnect"))}
        style={{
          // Estilos compactos para que el boton quepa dentro del banner.
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
