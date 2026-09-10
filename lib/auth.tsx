"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { alertaAdvertencia } from "@/lib/alerta";
import { fetchSeguro } from "@/lib/fetchSeguro";
import { activarNavegacionEnter } from "@/lib/navegacion";

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
    fetch("/api/csrf").catch(() => {});
    activarNavegacionEnter();
  }, []);

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

  useEffect(() => {
    if (user?.role !== "cliente") return;

    const MINUTOS = 15;
    const MS = MINUTOS * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    const cerrarPorInactividad = async () => {
      await logout();
      alertaAdvertencia(
        `Tu sesión se cerró por inactividad (${MINUTOS} minutos).`,
        "Sesión expirada"
      );
    };

    const reiniciar = () => {
      clearTimeout(timer);
      timer = setTimeout(cerrarPorInactividad, MS);
    };

    const eventos: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    eventos.forEach(e => window.addEventListener(e, reiniciar, { passive: true }));
    reiniciar();

    return () => {
      clearTimeout(timer);
      eventos.forEach(e => window.removeEventListener(e, reiniciar));
    };
  }, [user]);

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
    await fetchSeguro("/api/auth/logout", { method: "POST" });
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
