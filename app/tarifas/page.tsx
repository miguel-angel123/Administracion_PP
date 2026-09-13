"use client";

import { useCallback, useMemo, useState } from "react";
import { C } from "@/lib/tema";
import { Tarjeta } from "@/lib/componentes";
import { useLiveData } from "@/lib/live/useLiveData";

interface Tipo {
  id: string;
  nombre: string;
  icono: string;
}

interface Tarifa {
  id: string;
  modalidad: string;
  tipo_vehiculo_id: string | null;
  tipo_nombre: string;
  tipo_icono: string;
  valor_hora: number | null;
  valor_dia: number | null;
  valor_mes: number | null;
}

const iconoPorModalidad = (m: string) =>
  m === "por_hora" ? "🕐" : m === "diario" ? "🗓️" : "📅";

const etiquetaModalidad = (m: string) =>
  m === "por_hora" ? "Por hora" : m === "diario" ? "Diario" : m === "mensual" ? "Mensual" : m;

export default function TarifasPage() {
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const [tiposRes, tarifasRes] = await Promise.all([
        fetch("/api/vehiculos?recurso=tipos").then(r => r.json()),
        fetch("/api/tarifas").then(r => r.json()),
      ]);
      if (Array.isArray(tiposRes)) {
        setTipos(tiposRes);
        // Preselección de la primera opción: aplicada una sola vez, para que
        // el polling no resetee la elección del usuario.
        setTipoSeleccionado(prev => prev || (tiposRes.length > 0 ? tiposRes[0].id : ""));
      }
      if (Array.isArray(tarifasRes)) setTarifas(tarifasRes);
    } catch {
      // deja los estados iniciales
    }
  }, []);

  useLiveData(load, 30_000);

  const tarifasFiltradas = useMemo(() => {
    if (!tipoSeleccionado) return tarifas;
    return tarifas.filter(t => String(t.tipo_vehiculo_id) === String(tipoSeleccionado));
  }, [tarifas, tipoSeleccionado]);

  const precio = (t: Tarifa) => {
    const valor =
      t.modalidad === "por_hora" ? t.valor_hora
      : t.modalidad === "diario" ? t.valor_dia
      : t.valor_mes;
    return valor ? `$${valor.toLocaleString("es-CO")}` : "—";
  };

  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 24, gap: 12, flexWrap: "wrap",
      }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>
          Tarifas del Parqueadero
        </h2>
        <select
          value={tipoSeleccionado}
          onChange={e => setTipoSeleccionado(e.target.value)}
          style={{ maxWidth: 220 }}
        >
          <option value="">Todos los tipos</option>
          {tipos.map(tv => (
            <option key={tv.id} value={tv.id}>{tv.icono} {tv.nombre}</option>
          ))}
        </select>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
        gap: 16,
      }}>
        {tarifasFiltradas.length > 0 ? (
          tarifasFiltradas.map(t => (
            <Tarjeta
              key={t.id}
              style={{
                textAlign: "center",
                overflow: "hidden",
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                {iconoPorModalidad(t.modalidad)}
              </div>

              <h3 style={{
                fontFamily: "Syne",
                fontWeight: 800,
                fontSize: 20,
                textTransform: "capitalize",
              }}>
                {etiquetaModalidad(t.modalidad)}
              </h3>

              <p style={{ color: C.sub, fontSize: 12, marginTop: 2 }}>
                {t.tipo_icono} {t.tipo_nombre}
              </p>

              <p
                style={{
                  fontFamily: "Syne",
                  fontWeight: 800,
                  fontSize: 28,
                  color: C.gold,
                  margin: "10px 0 4px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={precio(t)}
              >
                {precio(t)}
              </p>
            </Tarjeta>
          ))
        ) : (
          <p style={{ color: C.sub }}>
            No hay tarifas configuradas para este tipo de vehículo.
          </p>
        )}
      </div>
    </div>
  );
}
