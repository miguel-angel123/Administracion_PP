"use client";

import { useAuth } from "@/lib/auth";
import BarraLateral from "@/components/BarraLateral";
import LoginPage from "@/components/LoginPage";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, cargando } = useAuth();

  if (cargando) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94A3B8",
        }}
      >
        Cargando…
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <BarraLateral />
      <main style={{ flex: 1, padding: "32px 36px", overflowY: "auto", minHeight: "100vh" }}>
        {children}
      </main>
    </div>
  );
}
