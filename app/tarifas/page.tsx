"use client";

import { useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { Tarjeta } from "@/lib/componentes";

interface Tarifa {
  icon: string;
  plan: string;
  precio: string;
  desc: string;
}

export default function TarifasPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/tarifas");
        const data = await res.json();
        if (Array.isArray(data)) setTarifas(data);
      } catch {
        // sin tarifas
      }
    }
    load();
  }, []);

  return (
    <div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24, marginBottom: 24 }}>Tarifas del Parqueadero</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
        {tarifas.length > 0 ? (
          tarifas.map(t => (
            <Tarjeta key={t.plan} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>{t.icon}</div>
              <h3 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 20 }}>{t.plan}</h3>
              <p style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 32, color: C.gold, margin: "8px 0" }}>{t.precio}</p>
              <p style={{ color: C.sub, fontSize: 13 }}>{t.desc}</p>
            </Tarjeta>
          ))
        ) : (
          <p style={{ color: C.sub }}>Cargando tarifas...</p>
        )}
      </div>
    </div>
  );
}
