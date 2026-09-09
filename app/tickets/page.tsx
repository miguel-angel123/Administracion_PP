"use client";

import { useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { Boton, Tarjeta, Etiqueta, Modal, FilaFormulario } from "@/lib/componentes";

type Ticket = {
  id: string;
  placa: string;
  propietario: string;
  entrada: string;
  salida: string;
  total: string;
  estado: string;
};

type Puesto = {
  id: string;
  numero_puesto: number;
  estado_puesto: boolean;
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ placa: "", doc: "", telefono: "", puesto: "" });

  const loadTickets = async () => {
    const res = await fetch("/api/tickets");
    const data = await res.json();
    if (Array.isArray(data)) setTickets(data);
  };

  const loadPuestos = async () => {
    const res = await fetch("/api/puestos");
    const data = await res.json();
    if (Array.isArray(data)) setPuestos(data);
  };

  useEffect(() => {
    loadTickets();
    loadPuestos();
  }, []);

  const libres = puestos.filter(p => !p.estado_puesto);

  const crear = async () => {
    if (!form.placa.trim() || !form.puesto) {
      alert("Debe ingresar placa y puesto");
      return;
    }

    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placa: form.placa.toUpperCase(),
        doc_propietario: form.doc,
        telefono: form.telefono,
        puestos_id_puesto: Number(form.puesto),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo crear el ticket");
      return;
    }

    setModal(false);
    setForm({ placa: "", doc: "", telefono: "", puesto: "" });
    await loadTickets();
    await loadPuestos();
  };

  const cerrar = async (id: string) => {
    if (!confirm("¿Cerrar y cobrar este ticket?")) return;
    const res = await fetch(`/api/tickets/${id}`, { method: "PATCH" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo cerrar el ticket");
      return;
    }
    if (data.valorTotal) {
      alert(`Ticket cerrado. Valor a pagar: $${data.valorTotal}`);
    }
    await loadTickets();
    await loadPuestos();
  };

  const cancelar = async (id: string) => {
    if (!confirm("¿Cancelar ticket?")) return;
    const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo cancelar el ticket");
      return;
    }
    await loadTickets();
    await loadPuestos();
  };

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
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {["ID", "Placa", "Propietario", "Entrada", "Salida", "Total", "Estado", "Acción"].map(h => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: C.sub, fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: .5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.length > 0 ? (
                tickets.map(t => (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "11px 16px", fontFamily: "Syne", fontWeight: 700, color: C.accent }}>{t.id}</td>
                    <td style={{ padding: "11px 16px", fontWeight: 600 }}>{t.placa}</td>
                    <td style={{ padding: "11px 16px" }}>{t.propietario}</td>
                    <td style={{ padding: "11px 16px", fontSize: 12, color: C.sub }}>{t.entrada}</td>
                    <td style={{ padding: "11px 16px", fontSize: 12, color: C.sub }}>{t.salida}</td>
                    <td style={{ padding: "11px 16px", color: C.gold, fontWeight: 700 }}>{t.total}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <Etiqueta label={t.estado} color={t.estado === "activo" ? "green" : t.estado === "cerrado" ? "blue" : "red"} />
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      {t.estado === "activo" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <Boton small variant="outline" onClick={() => cerrar(t.id)}>Cerrar</Boton>
                          <Boton small danger onClick={() => cancelar(t.id)}>Cancelar</Boton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: 30, textAlign: "center", color: C.sub }}>No hay tickets.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {modal && (
        <Modal title="Crear Ticket" onClose={() => setModal(false)}>
          <FilaFormulario label="Placa">
            <input
              value={form.placa}
              onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })}
              maxLength={6}
              placeholder="ABC123"
            />
          </FilaFormulario>
          <FilaFormulario label="Documento del propietario (solo si la placa no existe)">
            <input
              value={form.doc}
              onChange={e => setForm({ ...form, doc: e.target.value })}
              placeholder="Ej: 1234"
            />
          </FilaFormulario>
          <FilaFormulario label="Teléfono del propietario (si es nuevo)">
            <input
              value={form.telefono}
              onChange={e => setForm({ ...form, telefono: e.target.value })}
              maxLength={10}
              placeholder="3001234567"
            />
          </FilaFormulario>
          <FilaFormulario label="Puesto disponible">
            <select value={form.puesto} onChange={e => setForm({ ...form, puesto: e.target.value })}>
              <option value="">Seleccione…</option>
              {libres.map(p => (
                <option key={p.id} value={p.numero_puesto}>Puesto {p.numero_puesto}</option>
              ))}
            </select>
          </FilaFormulario>
          <p style={{ fontSize: 12, color: C.sub }}>
            La fecha y hora de ingreso se registran automáticamente con el momento actual.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Boton onClick={crear} style={{ flex: 1 }}>Crear</Boton>
            <Boton variant="ghost" onClick={() => setModal(false)} style={{ flex: 1 }}>Cancelar</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
