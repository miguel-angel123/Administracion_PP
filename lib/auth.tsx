"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Usuario } from "./datos";
import { USUARIOS } from "./datos";

interface AuthContextType {
  user: Usuario | null;
  login: (doc: string, password: string) => { ok: boolean; error: string };
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => ({ ok: false, error: "" }),
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);

  const login = (doc: string, password: string) => {
    const found = USUARIOS.find(u => u.doc === doc && u.password === password);
    if (found) {
      setUser(found);
      return { ok: true, error: "" };
    }
    return { ok: false, error: "Credenciales incorrectas" };
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
