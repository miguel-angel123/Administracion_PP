"use client";

import { C } from "@/lib/tema";
import { TarjetaEstadistica, Tarjeta } from "@/lib/componentes";
import { VEHICULOS_INIT } from "@/lib/datos";

export default function EstadisticasPage() {
  const vehiculos = VEHICULOS_INIT;
  const dias = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const data = [8, 12, 7, 15, 11, 20, 6];
  const maxD = Math.max(...data);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Estadísticas</h2>
        <p style={{ color: C.sub, fontSize: 14 }}>RF 2.8 · RF 3.5</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginBottom: 24 }}>
        <TarjetaEstadistica icon="🚗" label="Total vehículos" value={vehiculos.length} color={C.accent} />
        <TarjetaEstadistica icon="✅" label="Activos" value={vehiculos.filter(v => v.estado === "activo").length} color={C.green} />
        <TarjetaEstadistica icon="📅" label="Mensuales" value={vehiculos.filter(v => v.tipo === "mensual").length} color={C.accent2} />
        <TarjetaEstadistica icon="🗓️" label="Diarios hoy" value={vehiculos.filter(v => v.tipo === "diario").length} color={C.gold} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Tarjeta>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 20 }}>Ingresos semanales de vehículos</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 160 }}>
            {dias.map((d, i) => (
              <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>{data[i]}</span>
                <div style={{ width: "100%", borderRadius: "6px 6px 0 0", height: `${(data[i] / maxD) * 120}px`, background: `linear-gradient(180deg,${C.accent},${C.accent2})` }} />
                <span style={{ fontSize: 11, color: C.sub }}>{d}</span>
              </div>
            ))}
          </div>
        </Tarjeta>
        <Tarjeta>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 16 }}>Tarifas vigentes</h3>
          {[["🕐 Por hora", "$3.000 COP"], ["🗓️ Diario", "$18.000 COP"], ["📅 Mensual", "$200.000 COP"]].map(([t, v]) => (
            <div key={t} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14 }}>{t}</span>
              <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, color: C.sub }}>Espacios disponibles</p>
            <div style={{ marginTop: 8, background: C.surface, borderRadius: 8, height: 12, overflow: "hidden" }}>
              <div style={{ width: "62%", height: "100%", background: `linear-gradient(90deg,${C.green},#34D399)`, borderRadius: 8 }} />
            </div>
            <p style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>62 / 100 libres</p>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
