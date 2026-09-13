"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import BarraLateral from "@/components/BarraLateral";
import LoginPage from "@/components/LoginPage";
import BannerConexion from "@/components/BannerConexion";
import { C } from "@/lib/tema";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, cargando } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);

  if (cargando) {
    return (
      <div
        style={{minHeight: "100vh",display: "flex",alignItems: "center",justifyContent: "center",color: "#94A3B8",}}
      >
        Cargando…
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Global: un solo store, un solo banner. No aparece en login (arriba
          hay return temprano) ni se monta dos veces por página. */}
      <BannerConexion />

      <button
        type="button" className="menu-toggle" aria-label="Abrir menú" onClick={() => setMenuAbierto(true)}
        style={{background: C.surface,border: `1px solid ${C.border}`,color: C.text}}
      >
        ☰
      </button>

      {menuAbierto && (
        <div className="sidebar-backdrop" onClick={() => setMenuAbierto(false)} />
      )}

      <BarraLateral open={menuAbierto} onClose={() => setMenuAbierto(false)} />

      <main
        className="layout-main"
        style={{ flex: 1, padding: "32px 36px", overflowY: "auto", height: "100vh" }}
      >
        {children}
      </main>
    </div>
  );
}
