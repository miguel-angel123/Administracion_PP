// Marca este componente como componente de cliente.
// Es necesario porque usa hooks de React y estado local.
"use client";

// useState permite manejar el estado del menu lateral en pantallas pequenas.
import { useState } from "react";

// useAuth lee el usuario actual y el estado de carga desde el contexto global.
import { useAuth } from "@/lib/auth";

// BarraLateral es el menu principal de navegacion segun el rol.
import BarraLateral from "@/components/BarraLateral";

// LoginPage se muestra cuando no hay usuario autenticado.
import LoginPage from "@/components/LoginPage";

// BannerConexion avisa si las consultas live pierden conexion con el servidor.
import BannerConexion from "@/components/BannerConexion";

// C contiene la paleta de colores centralizada del proyecto.
import { C } from "@/lib/tema";

// AuthGate recibe children, que representa la pagina actual de Next.js.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  // user indica si hay sesion; cargando indica si todavia se esta verificando.
  const { user, cargando } = useAuth();
  // menuAbierto controla si el sidebar movil esta visible.
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Mientras AuthProvider consulta la sesion actual, se muestra una pantalla simple.
  if (cargando) {
    return (
      <div
        // Centra el texto "Cargando" en toda la pantalla.
        style={{minHeight: "100vh",display: "flex",alignItems: "center",justifyContent: "center",color: "#94A3B8",}}
      >
        Cargando…
      </div>
    );
  }

  // Si no existe usuario autenticado, se muestra el formulario de login.
  if (!user) {
    return <LoginPage />;
  }

  // Si hay usuario, se muestra la estructura privada de la aplicacion.
  return (
    // Contenedor horizontal: sidebar a la izquierda y contenido a la derecha.
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Global: un solo store, un solo banner. No aparece en login (arriba
          hay return temprano) ni se monta dos veces por página. */}
      <BannerConexion />

      {/* Boton visible en movil para abrir el menu lateral. */}
      <button
        // type evita que el boton actue como submit si algun dia queda dentro de un form.
        type="button" className="menu-toggle" aria-label="Abrir menú" onClick={() => setMenuAbierto(true)}
        // Usa colores globales para mantener consistencia visual.
        style={{background: C.surface,border: `1px solid ${C.border}`,color: C.text}}
      >
        ☰
      </button>

      {/* Fondo oscuro que aparece detras del sidebar en movil. */}
      {menuAbierto && (
        // Al hacer clic en el fondo, se cierra el menu.
        <div className="sidebar-backdrop" onClick={() => setMenuAbierto(false)} />
      )}

      {/* Menu lateral; recibe si esta abierto y como cerrarse. */}
      <BarraLateral open={menuAbierto} onClose={() => setMenuAbierto(false)} />

      {/* Area principal donde Next.js renderiza la pagina actual. */}
      <main
        className="layout-main"
        // Ocupa el espacio restante y permite scroll vertical dentro del contenido.
        style={{ flex: 1, padding: "32px 36px", overflowY: "auto", height: "100vh" }}
      >
        {/* children es la pagina actual: dashboard, vehiculos, tickets, etc. */}
        {children}
      </main>
    </div>
  );
}
