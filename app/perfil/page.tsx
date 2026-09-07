"use client";

import { C } from "@/lib/tema";
import { Tarjeta, Etiqueta } from "@/lib/componentes";
import { useAuth } from "@/lib/auth";

export default function PerfilPage() {
  const { user } = useAuth();

  return (
    <div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24, marginBottom: 24 }}>Mi Perfil</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Tarjeta>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: `${C.green}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, margin: "0 auto 12px" }}>🙋</div>
            <h3 style={{ fontFamily: "Syne", fontWeight: 700 }}>{user?.name}</h3>
            <Etiqueta label="Cliente" color="green" />
          </div>
          {[["Documento", user?.doc || ""], ["Placa", "ABC123"], ["Puesto", "A-12"], ["Tipo", "Mensual"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.sub, fontSize: 13 }}>{k}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span>
            </div>
          ))}
        </Tarjeta>
        <Tarjeta>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 14 }}>Mi Historial</h3>
          {[{ fecha: "2025-04-01", tipo: "Mensual", monto: "$200.000" }, { fecha: "2025-03-01", tipo: "Mensual", monto: "$200.000" }].map((h, i) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13 }}>{h.fecha}</span>
                <span style={{ fontWeight: 700, color: C.gold }}>{h.monto}</span>
              </div>
              <Etiqueta label={h.tipo} color="blue" />
            </div>
          ))}
        </Tarjeta>
      </div>
    </div>
  );
}
