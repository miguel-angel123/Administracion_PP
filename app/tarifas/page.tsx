"use client";

import { C } from "@/lib/tema";
import { Tarjeta } from "@/lib/componentes";

export default function TarifasPage() {
  return (
    <div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24, marginBottom: 24 }}>Tarifas del Parqueadero</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
        {[
          { icon: "🕐", plan: "Por Hora", precio: "$3.000", desc: "Ideal para visitas cortas" },
          { icon: "🗓️", plan: "Diario",   precio: "$18.000", desc: "Todo el día sin límite de salidas" },
          { icon: "📅", plan: "Mensual",  precio: "$200.000", desc: "Puesto fijo reservado el mes completo" },
        ].map(t => (
          <Tarjeta key={t.plan} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{t.icon}</div>
            <h3 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 20 }}>{t.plan}</h3>
            <p style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 32, color: C.gold, margin: "8px 0" }}>{t.precio}</p>
            <p style={{ color: C.sub, fontSize: 13 }}>{t.desc}</p>
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}
