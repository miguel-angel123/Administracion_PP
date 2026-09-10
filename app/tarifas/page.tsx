"use client";

import { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/tema";
import { Tarjeta } from "@/lib/componentes";

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

// Icono por modalidad (el tipo de vehículo se muestra aparte como subtítulo).
const iconoPorModalidad = (m: string) =>
  m === "por_hora" ? "🕐" : m === "diario" ? "🗓️" : "📅";

export default function TarifasPage() {
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [tipoSeleccionado, setTipoSeleccionado] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const [tiposRes, tarifasRes] = await Promise.all([
          fetch("/api/vehiculos?recurso=tipos").then(r => r.json()),
          fetch("/api/tarifas?recurso=por-tipo").then(r => r.json()),
        ]);
        if (Array.isArray(tiposRes)) {
          setTipos(tiposRes);
          // Preselecciona el primero para no dejar la vista vacía al entrar.
          if (tiposRes.length > 0) setTipoSeleccionado(tiposRes[0].id);
        }
        if (Array.isArray(tarifasRes)) setTarifas(tarifasRes);
      } catch {
        // deja los estados iniciales
      }
    }
    load();
  }, []);

  // Filtra por tipo. Con "" se muestran todas las tarifas.
  const tarifasFiltradas = useMemo(() => {
    if (!tipoSeleccionado) return tarifas;
    return tarifas.filter(t => String(t.tipo_vehiculo_id) === String(tipoSeleccionado));
  }, [tarifas, tipoSeleccionado]);

  // Solo se pinta el valor correspondiente a la modalidad de esa fila.
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
                overflow: "hidden",   // evita que un precio largo se salga de la tarjeta
                minWidth: 0,           // permite que el grid respete el ancho mínimo
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
                {t.modalidad.replace("_", " ")}
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
                  // Tres reglas para que el precio nunca desborde la tarjeta.
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
