"use client";

import { AuthProvider, useAuth } from "@/lib/auth";
import BarraLateral from "@/components/BarraLateral";
import LoginPage from "@/components/LoginPage";
import "./globals.css";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <title>La Pradera — Parqueadero</title>
      </head>
      <body>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
