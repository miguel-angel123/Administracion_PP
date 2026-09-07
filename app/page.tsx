"use client";

import { C } from "@/lib/tema";
import { TarjetaEstadistica, Tarjeta, Etiqueta } from "@/lib/componentes";
import { VEHICULOS_INIT, EMPLEADOS_INIT, SUGERENCIAS_INIT } from "@/lib/datos";
import { useAuth } from "@/lib/auth";

export default function Inicio() {
  const { user } = useAuth();
  const vehiculos = VEHICULOS_INIT;
  const empleados = EMPLEADOS_INIT;
  const sugerencias = SUGERENCIAS_INIT;

  const activos = vehiculos.filter(v => v.estado === "activo").length;
  const mensuales = vehiculos.filter(v => v.tipo === "mensual" && v.estado === "activo").length;
  const pendientes = sugerencias.filter(s => s.estado === "pendiente").length;

  return (
    <div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24, marginBottom: 6 }}>
        Bienvenido, {user?.name.split(" ")[0]} 👋
      </h2>
      <p style={{ color: C.sub, marginBottom: 28 }}>Resumen del sistema — Parqueadero La Pradera</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16, marginBottom: 28 }}>
        <TarjetaEstadistica icon="🚗" label="Vehículos activos" value={activos} color={C.accent} />
        <TarjetaEstadistica icon="📅" label="Mensuales" value={mensuales} color={C.accent2} />
        {user?.role !== "cliente" && <TarjetaEstadistica icon="👷" label="Empleados" value={empleados.length} color={C.green} />}
        <TarjetaEstadistica icon="💬" label="Sugerencias" value={pendientes} color={C.gold} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Tarjeta>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 14 }}>Últimas Sugerencias</h3>
          {sugerencias.slice(0, 3).map(s => (
            <div key={s.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.usuario}</span>
                <Etiqueta label={s.estado} color={s.estado === "pendiente" ? "gold" : "blue"} />
              </div>
              <p style={{ color: C.sub, fontSize: 13 }}>{s.texto.slice(0, 60)}…</p>
            </div>
          ))}
        </Tarjeta>
        <Tarjeta>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 14 }}>Vehículos Recientes</h3>
          {vehiculos.slice(0, 4).map(v => (
            <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 13 }}>{v.placa}</p>
                <p style={{ color: C.sub, fontSize: 12 }}>{v.nombre}</p>
              </div>
              <Etiqueta label={v.tipo} color={v.tipo === "mensual" ? "blue" : "green"} />
            </div>
          ))}
        </Tarjeta>
      </div>
    </div>
  );
}
