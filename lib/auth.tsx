"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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

    async function hidratar() {
      // Hasta 3 intentos. Sólo se agota el bucle con 503/red caída; 401 y 200
      // cortan el ciclo de inmediato.
      for (let intento = 0; intento < 3; intento++) {
        try {
          const res = await fetch("/api/auth/me");

          if (res.status === 401) {
            // Sesión inválida o inexistente: no reintentar.
            if (activo) { setUser(null); setCargando(false); }
            return;
          }

          if (res.status === 503) {
            // Neon cold start. Backoff corto y reintentar.
            if (intento < 2) {
              await new Promise(r => setTimeout(r, 1000 * (intento + 1)));
              continue;
            }
            // Reintentos agotados: se deja usuario en null y cargando en false
            // para no colgar el AuthGate indefinidamente.
            if (activo) { setUser(null); setCargando(false); }
            return;
          }

          if (!res.ok) {
            // 4xx/5xx no clasificados: sin sesión, sin reintento.
            if (activo) { setUser(null); setCargando(false); }
            return;
          }

          const data = await res.json();
          if (activo) {
            if (data.ok) setUser(data.user);
            setCargando(false);
          }
          return;
        } catch {
          // Fallo de red (fetch lanza). Backoff y reintentar; si es el último
          // intento, se cierra la carga sin usuario.
          if (intento < 2) {
            await new Promise(r => setTimeout(r, 1000 * (intento + 1)));
            continue;
          }
          if (activo) { setUser(null); setCargando(false); }
          return;
        }
      }
    }

    hidratar();
    return () => { activo = false; };
  }, []);

  // Estable para que los efectos que lo referencian no re-suscriban en cada render.
  const logout = useCallback(async () => {
    await fetchSeguro("/api/auth/logout", { method: "POST" });
    setUser(null);
    setCargando(false);
  }, []);

  // Cualquier 401 en cualquier fetch (clienteFetch lo detecta) dispara este
  // evento. Un solo lugar cierra sesión; el AuthGate, al ver user=null,
  // renderiza LoginPage sin router.replace explícito.
  useEffect(() => {
    const onExpira = () => { void logout(); };
    window.addEventListener("sesion-expirada", onExpira);
    return () => window.removeEventListener("sesion-expirada", onExpira);
  }, [logout]);

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
  }, [user, logout]);

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

  return (
    <AuthContext.Provider value={{ user, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
