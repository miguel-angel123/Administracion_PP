"use client";

import { useCallback, useState } from "react";
import { C } from "@/lib/tema";
import { TarjetaEstadistica, Tarjeta } from "@/lib/componentes";
import { useLiveData } from "@/lib/live/useLiveData";

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

interface TarifaPorTipo {
  id: string;
  modalidad: string;
  tipo_vehiculo_id: string;
  tipo_nombre: string;
  tipo_icono: string;
  valor_hora: number | null;
  valor_dia: number | null;
  valor_mes: number | null;
}

interface TipoVehiculo {
  id: string;
  nombre: string;
  icono: string;
}

const ETIQUETA_MODALIDAD: Record<string, string> = {
  por_hora: "Por hora",
  diario: "Diario",
  mensual: "Mensual",
};

function valorDeTarifa(t: TarifaPorTipo): number | null {
  if (t.modalidad === "por_hora") return t.valor_hora;
  if (t.modalidad === "diario") return t.valor_dia;
  if (t.modalidad === "mensual") return t.valor_mes;
  return null;
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

  const [tarifas, setTarifas] = useState<TarifaPorTipo[]>([]);
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState("");

  const load = useCallback(async () => {
    try {
      const [statsRes, tarifasRes, tiposRes] = await Promise.all([
        fetch("/api/estadisticas").then(r => r.json()),
        fetch("/api/tarifas").then(r => r.json()),
        fetch("/api/vehiculos?recurso=tipos").then(r => r.json()),
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

      if (Array.isArray(tiposRes)) {
        setTipos(tiposRes);
        // Preselección solo la primera carga; el polling (15 s) no debe resetear
        // la elección del usuario.
        setTipoSeleccionado(prev => prev || (tiposRes[0]?.id ?? ""));
      }
    } catch {
      // Mantiene valores iniciales
    }
  }, []);

  useLiveData(load, 15_000);

  const dias = stats.ingresosSemanales.map(d => d.dia);
  const data = stats.ingresosSemanales.map(d => d.total);
  const maxD = data.length ? Math.max(...data) || 1 : 1;

  const tarifasVisibles = tipoSeleccionado
    ? tarifas.filter(t => String(t.tipo_vehiculo_id) === tipoSeleccionado)
    : tarifas;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Estadísticas</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginBottom: 24 }}>
        <TarjetaEstadistica icon="🚗" label="Total vehículos" value={stats.totalVehiculos} color={C.accent} />
        <TarjetaEstadistica icon="✅" label="Activos" value={stats.activos} color={C.green} />
        <TarjetaEstadistica icon="📅" label="Mensuales" value={stats.mensuales} color={C.accent2} />
        <TarjetaEstadistica icon="🗓️" label="Diarios hoy" value={stats.diarios} color={C.gold} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Tarjeta>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 20 }}>Actividad semanal de vehículos</h3>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <h3 style={{ fontFamily: "Syne", fontWeight: 700 }}>Tarifas vigentes</h3>
            <select
              value={tipoSeleccionado}
              onChange={e => setTipoSeleccionado(e.target.value)}
              style={{ maxWidth: 180 }}
            >
              <option value="">Todos</option>
              {tipos.map(tv => (
                <option key={tv.id} value={tv.id}>{tv.icono} {tv.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {tarifasVisibles.length > 0 ? (
              tarifasVisibles.map(t => {
                const valor = valorDeTarifa(t);
                return (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 14 }}>
                      {t.tipo_icono} {t.tipo_nombre} — {ETIQUETA_MODALIDAD[t.modalidad] ?? t.modalidad}
                    </span>
                    <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>
                      {valor != null ? `$${valor.toLocaleString("es-CO")}` : "—"}
                    </span>
                  </div>
                );
              })
            ) : (
              <p style={{ color: C.sub, fontSize: 13 }}>
                {tarifas.length === 0 ? "Cargando tarifas…" : "Sin tarifas para este tipo."}
              </p>
            )}
          </div>
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
