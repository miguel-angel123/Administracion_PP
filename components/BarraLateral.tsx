// Marca este componente como cliente porque usa hooks de navegacion y autenticacion.
"use client";

// Link permite navegar entre paginas de Next.js sin recargar toda la app.
import Link from "next/link";

// usePathname lee la ruta actual; useRouter permite redirigir por codigo.
import { usePathname, useRouter } from "next/navigation";

// useAuth entrega usuario actual y funcion logout.
import { useAuth } from "@/lib/auth";

// Colores centralizados de la interfaz.
import { C } from "@/lib/tema";

// Etiqueta visual reutilizable para mostrar el rol.
import { Etiqueta } from "@/lib/componentes";

// Menu disponible para cada rol.
const menuPorRol: Record<string, { label: string; href: string; icon: string }[]> = {
  // Opciones visibles para gerente.
  gerente: [
    { label: "Inicio", href: "/", icon: "🏠" },
    { label: "Vehículos", href: "/vehiculos", icon: "🚗" },
    { label: "Empleados", href: "/empleados", icon: "👷" },
    { label: "Sugerencias", href: "/sugerencias", icon: "💬" },
    { label: "Registros", href: "/registros", icon: "📋" },
    { label: "Estadísticas", href: "/estadisticas", icon: "📊" },
    { label: "Tickets", href: "/tickets", icon: "🎫" },
  ],
  // Opciones visibles para empleados operativos.
  empleado: [
    { label: "Inicio", href: "/", icon: "🏠" },
    { label: "Tickets", href: "/tickets", icon: "🎫" },
    { label: "Vehículos", href: "/vehiculos", icon: "🚗" },
    { label: "Sugerencias", href: "/sugerencias", icon: "💬" },
    { label: "Estadísticas", href: "/estadisticas", icon: "📊" },
  ],
  // Opciones visibles para clientes.
  cliente: [
    { label: "Mi Perfil", href: "/perfil", icon: "👤" },
    { label: "Tarifas", href: "/tarifas", icon: "💰" },
    { label: "Sugerencias", href: "/sugerencias", icon: "💬" },
  ],
};

// Texto y color de etiqueta segun rol.
const etiquetasRol: Record<string, { label: string; color: string }> = {
  gerente: { label: "Gerente General", color: "gold" },
  empleado: { label: "Equipo Operativo", color: "blue" },
  cliente: { label: "Cliente", color: "green" },
};

// Icono decorativo mostrado en el bloque de usuario.
const iconosRol: Record<string, string> = {
  gerente: "👔",
  empleado: "👷",
  cliente: "🙋",
};

// Props que recibe el sidebar desde AuthGate.
interface Props {
  // Indica si el menu movil esta abierto.
  open?: boolean;
  // Funcion opcional para cerrar el menu.
  onClose?: () => void;
}

// Barra lateral principal de navegacion.
export default function BarraLateral({ open = false, onClose }: Props) {
  // Lee el usuario autenticado y la funcion para cerrar sesion.
  const { user, logout } = useAuth();
  // Ruta actual, usada para marcar el enlace activo.
  const pathname = usePathname();
  // Router para redirigir despues del logout.
  const router = useRouter();

  // Si por alguna razon no hay usuario, no muestra sidebar.
  if (!user) return null;

  // Obtiene los items del menu segun el rol actual.
  const items = menuPorRol[user.role] || [];
  // Obtiene informacion visual del rol actual.
  const rolInfo = etiquetasRol[user.role];

  // Cierra sesion en backend/contexto y vuelve al inicio.
  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  // Renderiza el contenedor completo del menu lateral.
  return (
    <div
      // Agrega la clase open cuando el menu movil esta visible.
      className={`sidebar${open ? " open" : ""}`}
      style={{
        // Sidebar fijo en ancho, con altura completa y borde derecho.
        width: 230, background: C.surface, borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", minHeight: "100vh", height: "100vh", flexShrink: 0,
      }}
    >
      {/* Bloque superior con marca de la aplicacion. */}
      <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            // Icono cuadrado con degradado de marca.
            width: 38, height: 38, borderRadius: 10,
            background: `linear-gradient(135deg,${C.accent},${C.accent2})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🅿</div>
          <div>
            {/* Nombre del sistema. */}
            <p style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 15 }}>La Pradera</p>
            {/* Subtitulo corto. */}
            <p style={{ fontSize: 11, color: C.sub }}>Parqueadero</p>
          </div>
        </div>
      </div>

      {/* Bloque de identidad del usuario autenticado. */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{
          // Caja del icono del rol.
          width: 40, height: 40, borderRadius: 12, background: C.card,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 8,
        }}>
          {/* Icono correspondiente al rol del usuario. */}
          {iconosRol[user.role]}
        </div>
        {/* Nombre del usuario actual. */}
        <p style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{user.name}</p>
        {/* Etiqueta con nombre legible del rol. */}
        <Etiqueta label={rolInfo.label} color={rolInfo.color} />
      </div>

      {/* Navegacion principal del modulo privado. */}
      <nav style={{ flex: 1, padding: "12px 12px", overflowY: "auto", minHeight: 0 }}>
        {/* Crea un enlace por cada item permitido para el rol. */}
        {items.map(item => {
          // Marca como activo el item cuya ruta coincide con la ruta actual.
          const isActive = pathname === item.href;
          return (
            // Link navega sin recargar y cierra el menu movil si estaba abierto.
            <Link key={item.href} href={item.href} onClick={() => onClose?.()} style={{
              // Estilos base del enlace del sidebar.
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 10,
              // El enlace activo recibe fondo y borde resaltado.
              background: isActive ? `linear-gradient(135deg,${C.accent}22,${C.accent2}22)` : "transparent",
              border: isActive ? `1px solid ${C.accent}44` : "1px solid transparent",
              color: isActive ? C.accent : C.sub, fontWeight: isActive ? 600 : 400,
              fontSize: 14, textAlign: "left", marginBottom: 2, textDecoration: "none",
            }}>
              {/* Icono y texto del enlace. */}
              <span>{item.icon}</span>{item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bloque inferior con accion de cerrar sesion. */}
      <div style={{ padding: "12px 12px", borderTop: `1px solid ${C.border}` }}>
        {/* Boton que llama al logout del contexto. */}
        <button onClick={handleLogout} style={{
          // Estilos discretos para una accion secundaria.
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
