"use client";

import { useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { TarjetaEstadistica, Tarjeta } from "@/lib/componentes";

interface Estadisticas {
  totalVehiculos: number;
  activos: number;
  mensuales: number;
  diarios: number;
  totalPuestos: number;
  puestosOcupados: number;
  puestosDisponibles: number;
  ingresosSemanales: { dia: string; total: number }[];
}

interface Tarifa {
  icon: string;
  plan: string;
  precio: string;
}

export default function EstadisticasPage() {
  const [stats, setStats] = useState<Estadisticas>({
    totalVehiculos: 0,
    activos: 0,
    mensuales: 0,
    diarios: 0,
    totalPuestos: 0,
    puestosOcupados: 0,
    puestosDisponibles: 0,
    ingresosSemanales: [],
  });

  const [tarifas, setTarifas] = useState<Tarifa[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, tarifasRes] = await Promise.all([
          fetch("/api/estadisticas").then(r => r.json()),
          fetch("/api/tarifas").then(r => r.json()),
        ]);

        setStats({
          totalVehiculos: statsRes.totalVehiculos ?? 0,
          activos: statsRes.activos ?? 0,
          mensuales: statsRes.mensuales ?? 0,
          diarios: statsRes.diarios ?? 0,
          totalPuestos: statsRes.totalPuestos ?? 0,
          puestosOcupados: statsRes.puestosOcupados ?? 0,
          puestosDisponibles: statsRes.puestosDisponibles ?? 0,
          ingresosSemanales: Array.isArray(statsRes.ingresosSemanales)
            ? statsRes.ingresosSemanales
            : [],
        });

        if (Array.isArray(tarifasRes)) setTarifas(tarifasRes);
      } catch {
        // Mantiene valores iniciales
      }
    }
    load();
  }, []);

  const dias = stats.ingresosSemanales.map(d => d.dia);
  const data = stats.ingresosSemanales.map(d => d.total);
  const maxD = data.length ? Math.max(...data) || 1 : 1;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Estadísticas</h2>
        <p style={{ color: C.sub, fontSize: 14 }}>RF 2.8 · RF 3.5</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginBottom: 24 }}>
        <TarjetaEstadistica icon="🚗" label="Total vehículos" value={stats.totalVehiculos} color={C.accent} />
        <TarjetaEstadistica icon="✅" label="Activos" value={stats.activos} color={C.green} />
        <TarjetaEstadistica icon="📅" label="Mensuales" value={stats.mensuales} color={C.accent2} />
        <TarjetaEstadistica icon="🗓️" label="Diarios hoy" value={stats.diarios} color={C.gold} />
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
          {tarifas.length > 0 ? (
            tarifas.map(t => (
              <div key={t.plan} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 14 }}>{t.icon} {t.plan}</span>
                <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{t.precio}</span>
              </div>
            ))
          ) : (
            <p style={{ color: C.sub, fontSize: 13 }}>Cargando tarifas…</p>
          )}
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, color: C.sub }}>Espacios disponibles</p>
            <div style={{ marginTop: 8, background: C.surface, borderRadius: 8, height: 12, overflow: "hidden" }}>
              <div style={{
                width: `${stats.totalPuestos ? (stats.puestosDisponibles / stats.totalPuestos) * 100 : 0}%`,
                height: "100%",
                background: `linear-gradient(90deg,${C.green},#34D399)`,
                borderRadius: 8,
              }} />
            </div>
            <p style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
              {stats.puestosDisponibles} / {stats.totalPuestos} libres ({stats.puestosOcupados} ocupados)
            </p>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
