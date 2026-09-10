"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/tema";
import { Etiqueta } from "@/lib/componentes";

const menuPorRol: Record<string, { label: string; href: string; icon: string }[]> = {
  gerente: [
    { label: "Inicio", href: "/", icon: "🏠" },
    { label: "Vehículos", href: "/vehiculos", icon: "🚗" },
    { label: "Empleados", href: "/empleados", icon: "👷" },
    { label: "Sugerencias", href: "/sugerencias", icon: "💬" },
    { label: "Registros", href: "/registros", icon: "📋" },
    { label: "Estadísticas", href: "/estadisticas", icon: "📊" },
    { label: "Tickets", href: "/tickets", icon: "🎫" },
  ],
  empleado: [
    { label: "Inicio", href: "/", icon: "🏠" },
    { label: "Tickets", href: "/tickets", icon: "🎫" },
    { label: "Vehículos", href: "/vehiculos", icon: "🚗" },
    { label: "Sugerencias", href: "/sugerencias", icon: "💬" },
    { label: "Estadísticas", href: "/estadisticas", icon: "📊" },
  ],
  cliente: [
    { label: "Mi Perfil", href: "/perfil", icon: "👤" },
    { label: "Tarifas", href: "/tarifas", icon: "💰" },
    { label: "Sugerencias", href: "/sugerencias", icon: "💬" },
  ],
};

const etiquetasRol: Record<string, { label: string; color: string }> = {
  gerente: { label: "Gerente General", color: "gold" },
  empleado: { label: "Equipo Operativo", color: "blue" },
  cliente: { label: "Cliente", color: "green" },
};

const iconosRol: Record<string, string> = {
  gerente: "👔",
  empleado: "👷",
  cliente: "🙋",
};

interface Props {
  open?: boolean;
  onClose?: () => void;
}

export default function BarraLateral({ open = false, onClose }: Props) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!user) return null;

  const items = menuPorRol[user.role] || [];
  const rolInfo = etiquetasRol[user.role];

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div
      className={`sidebar${open ? " open" : ""}`}
      style={{
        width: 230, background: C.surface, borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", minHeight: "100vh", flexShrink: 0,
      }}
    >
      <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: `linear-gradient(135deg,${C.accent},${C.accent2})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🅿</div>
          <div>
            <p style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 15 }}>La Pradera</p>
            <p style={{ fontSize: 11, color: C.sub }}>Parqueadero</p>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, background: C.card,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 8,
        }}>
          {iconosRol[user.role]}
        </div>
        <p style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{user.name}</p>
        <Etiqueta label={rolInfo.label} color={rolInfo.color} />
      </div>

      <nav style={{ flex: 1, padding: "12px 12px" }}>
        {items.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} onClick={() => onClose?.()} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 10,
              background: isActive ? `linear-gradient(135deg,${C.accent}22,${C.accent2}22)` : "transparent",
              border: isActive ? `1px solid ${C.accent}44` : "1px solid transparent",
              color: isActive ? C.accent : C.sub, fontWeight: isActive ? 600 : 400,
              fontSize: 14, textAlign: "left", marginBottom: 2, textDecoration: "none",
            }}>
              <span>{item.icon}</span>{item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: "12px 12px", borderTop: `1px solid ${C.border}` }}>
        <button onClick={handleLogout} style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "10px 12px", borderRadius: 10, background: "transparent",
          border: `1px solid ${C.border}`, color: C.sub, fontSize: 14, cursor: "pointer",
        }}>
          <span>🚪</span> Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
