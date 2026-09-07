"use client";

import { useState } from "react";
import { C } from "@/lib/tema";
import { Boton, Tarjeta, Etiqueta, Modal, FilaFormulario } from "@/lib/componentes";
import type { Ticket } from "@/lib/datos";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([
    { id: "TK-001", placa: "XYZ789", propietario: "Laura Gómez",   entrada: "2025-05-10 08:00", salida: "2025-05-10 17:00", total: "$27.000", estado: "cerrado" },
    { id: "TK-002", placa: "GHI321", propietario: "Marcela Ruiz",  entrada: "2025-05-10 09:30", salida: "—",                total: "—",        estado: "activo" },
  ]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ placa: "", propietario: "", entrada: "" });

  const crear = () => {
    setTickets(prev => [...prev, { id: `TK-00${Date.now() % 100}`, ...form, salida: "—", total: "—", estado: "activo" }]);
    setModal(false);
    setForm({ placa: "", propietario: "", entrada: "" });
  };

  const cancelar = (id: string) => setTickets(prev => prev.map(t => t.id === id ? { ...t, estado: "cancelado" } : t));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Tickets</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>RF 2.9</p>
        </div>
        <Boton onClick={() => setModal(true)}>+ Crear Ticket</Boton>
      </div>

      <Tarjeta style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: C.surface }}>
              {["ID", "Placa", "Propietario", "Entrada", "Salida", "Total", "Estado", "Acción"].map(h => (
                <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: C.sub, fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: .5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map(t => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "11px 16px", fontFamily: "Syne", fontWeight: 700, color: C.accent }}>{t.id}</td>
                <td style={{ padding: "11px 16px", fontWeight: 600 }}>{t.placa}</td>
                <td style={{ padding: "11px 16px" }}>{t.propietario}</td>
                <td style={{ padding: "11px 16px", fontSize: 12, color: C.sub }}>{t.entrada}</td>
                <td style={{ padding: "11px 16px", fontSize: 12, color: C.sub }}>{t.salida}</td>
                <td style={{ padding: "11px 16px", color: C.gold, fontWeight: 700 }}>{t.total}</td>
                <td style={{ padding: "11px 16px" }}><Etiqueta label={t.estado} color={t.estado === "activo" ? "green" : t.estado === "cerrado" ? "blue" : "red"} /></td>
                <td style={{ padding: "11px 16px" }}>{t.estado === "activo" && <Boton small danger onClick={() => cancelar(t.id)}>Cancelar</Boton>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>

      {modal && (
        <Modal title="Crear Ticket" onClose={() => setModal(false)}>
          <FilaFormulario label="Placa"><input value={form.placa} onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })} maxLength={6} /></FilaFormulario>
          <FilaFormulario label="Propietario"><input value={form.propietario} onChange={e => setForm({ ...form, propietario: e.target.value })} /></FilaFormulario>
          <FilaFormulario label="Hora de entrada"><input type="datetime-local" value={form.entrada} onChange={e => setForm({ ...form, entrada: e.target.value })} /></FilaFormulario>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Boton onClick={crear} style={{ flex: 1 }}>Crear</Boton>
            <Boton variant="ghost" onClick={() => setModal(false)} style={{ flex: 1 }}>Cancelar</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
