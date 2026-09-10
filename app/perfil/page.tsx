"use client";

import { useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { Tarjeta, Etiqueta } from "@/lib/componentes";

interface PerfilData {
  nombre: string;
  doc: string;
  role: string;
  email?: string;
  telefono?: string;
  vehiculos: {
    placa: string;
    color: string | null;
    tipo: string;
    contrato_inicio: string | null;
    contrato_fin: string | null;
    puesto: string | null;
  }[];
  historial: {
    fecha: string;
    valor: number | null;
  }[];
}

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<PerfilData | null>(null);

  useEffect(() => {
    fetch("/api/perfil")
      .then(r => r.json())
      .then(data => setPerfil(data))
      .catch(() => {});
  }, []);

  if (!perfil) {
    return <p style={{ color: C.sub }}>Cargando perfil…</p>;
  }

  return (
    <div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24, marginBottom: 24 }}>Mi Perfil</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Tarjeta>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: `${C.green}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, margin: "0 auto 12px" }}>🙋</div>
            <h3 style={{ fontFamily: "Syne", fontWeight: 700 }}>{perfil.nombre}</h3>
            <Etiqueta label={perfil.role} color={perfil.role === "cliente" ? "green" : perfil.role === "empleado" ? "blue" : "gold"} />
          </div>
          {[
            ["Documento", perfil.doc],
            ["Correo", perfil.email || "—"],
            ["Teléfono", perfil.telefono || "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.sub, fontSize: 13 }}>{k}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span>
            </div>
          ))}
        </Tarjeta>

        <Tarjeta>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 14 }}>Vehículos</h3>
          {perfil.vehiculos.length > 0 ? (
            perfil.vehiculos.map(v => (
              <div key={v.placa} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{v.placa}</span>
                  <Etiqueta label={v.tipo} color="blue" />
                </div>
                <p style={{ color: C.sub, fontSize: 12, marginTop: 6 }}>
                  {v.tipo === "mensual"
                    ? `Contrato: ${v.contrato_inicio || "—"} → ${v.contrato_fin || "—"}`
                    : `Puesto actual: ${v.puesto || "—"}`}
                </p>
              </div>
            ))
          ) : (
            <p style={{ color: C.sub, fontSize: 13 }}>No tiene vehículos registrados.</p>
          )}

          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginTop: 20, marginBottom: 14 }}>Mi Historial</h3>
          {perfil.historial.length > 0 ? (
            perfil.historial.map((h, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13 }}>{h.fecha}</span>
                  <span style={{ fontWeight: 700, color: C.gold }}>{h.valor ? `$${h.valor.toLocaleString("es-CO")}` : "—"}</span>
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: C.sub, fontSize: 13 }}>Sin movimientos registrados.</p>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
