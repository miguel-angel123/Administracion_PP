"use client";

import { useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { Tarjeta, Etiqueta } from "@/lib/componentes";

interface LogEntry {
  id: number;
  tipo: string;
  usuario: string;
  accion: string;
  fecha: string;
}

export default function RegistrosPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/registros");
        const data = await res.json();
        if (Array.isArray(data)) setLogs(data);
      } catch {
        setLogs([]);
      }
    }
    load();
  }, []);

  const typeColor: Record<string, string> = {
    LOGIN: "blue",
    CREATE: "green",
    EDIT: "gold",
    INACTIVE: "red",
    TICKET: "green",
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Registros (Logs)</h2>
        <p style={{ color: C.sub, fontSize: 14 }}>RF 2.7 — movimientos del sistema</p>
      </div>
      <Tarjeta style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {["#", "Tipo", "Usuario", "Acción", "Fecha"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.sub, fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: .5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map(l => (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "11px 16px", color: C.muted }}>{l.id}</td>
                    <td style={{ padding: "11px 16px" }}><Etiqueta label={l.tipo} color={typeColor[l.tipo] || "blue"} /></td>
                    <td style={{ padding: "11px 16px", fontWeight: 600 }}>{l.usuario}</td>
                    <td style={{ padding: "11px 16px", color: C.sub }}>{l.accion}</td>
                    <td style={{ padding: "11px 16px", color: C.sub, fontSize: 12 }}>{l.fecha}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: 30, textAlign: "center", color: C.sub }}>No hay registros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
