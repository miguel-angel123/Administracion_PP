"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface AuthContextType {
  user: Usuario | null;
  cargando: boolean;
  login: (doc: string, password: string) => Promise<{ ok: boolean; error: string }>;
  logout: () => Promise<void>;
}

type Usuario = {
  id: number;
  doc: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  estado?: string;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  cargando: true,
  login: async () => ({ ok: false, error: "Invalid implementation" }),
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;

    fetch("/api/auth/me")
      .then(res => res.json())
      .then(data => {
        if (activo && data.ok) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => { activo = false; };
  }, []);

  const login = async (doc: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, password }),
      });

      const data = await res.json().catch(() => null);

      if (!data) {
        return { ok: false, error: "El servidor no devolvió una respuesta válida." };
      }

      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || "No se pudo iniciar sesión." };
      }

      setUser(data.user);
      setCargando(false);
      return { ok: true, error: "" };
    } catch {
      setCargando(false);
      return { ok: false, error: "Error de conexión. Intenta de nuevo." };
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setCargando(false);
  };

  return (
    <AuthContext.Provider value={{ user, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
