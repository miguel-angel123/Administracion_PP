"use client";

import { useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { Boton, Tarjeta, Etiqueta, Modal, FilaFormulario } from "@/lib/componentes";
import { useAuth } from "@/lib/auth";

interface VehiculoDB {
  placa: string;
  doc?: string;
  telefono?: string;
  color?: string;
  nombre: string;
  tipo: string;
  puesto?: string;
  correo?: string;
  estado?: string;
  ingreso?: string;
  salida?: string;
}

export default function VehiculosPage() {
  const { user } = useAuth();
  const [vehiculos, setVehiculos] = useState<VehiculoDB[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<VehiculoDB | null>(null);
  const [form, setForm] = useState<Partial<VehiculoDB>>({});

  const canCreate = user?.role === "gerente";
  const canEdit = user?.role === "gerente";
  const canInactivate = user?.role === "gerente";

  const load = async () => {
    const res = await fetch("/api/vehiculos");
    const data = await res.json();
    setVehiculos(data);
  };

  useEffect(() => { load(); }, []);

  const visible = vehiculos.filter(v => {
    const q = search.toLowerCase();
    const match = v.placa.toLowerCase().includes(q) || v.nombre.toLowerCase().includes(q);
    const typeMatch = filter === "todos" || v.tipo === filter || v.estado === filter;
    return match && typeMatch;
  });

  const openCreate = () => {
    setForm({ placa: "", nombre: "", doc: "", telefono: "", color: "", tipo: "mensual" });
    setModal("create");
  };

  const openEdit = (v: VehiculoDB) => { setForm({ ...v }); setSelected(v); setModal("edit"); };
  const openView = (v: VehiculoDB) => { setSelected(v); setModal("view"); };

  const save = async () => {
    if (modal === "create") {
      const res = await fetch("/api/vehiculos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: form.placa?.toUpperCase(),
          doc: form.doc,
          nombre: form.nombre,
          telefono: form.telefono,
          color: form.color || "No especificado",
          tipo: "mensual",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "No se pudo registrar el vehículo");
        return;
      }
    } else {
      const res = await fetch(`/api/vehiculos/${form.placa}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: form.estado }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "No se pudo actualizar");
        return;
      }
    }
    setModal(null);
    await load();
  };

  const inactivar = async (placa: string, estadoActual?: string) => {
    const nuevoEstado = estadoActual === "inactivo" ? "activo" : "inactivo";

    const res = await fetch(`/api/vehiculos/${placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "No se pudo actualizar el vehículo");
      return;
    }

    await load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Vehículos</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>RF 2.2 · RF 2.3 · RF 3.2</p>
        </div>
        {canCreate && <Boton onClick={openCreate}>+ Registrar Vehículo</Boton>}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por placa o nombre…" style={{ maxWidth: 280 }} />
        {["todos", "mensual", "diario", "activo", "inactivo"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid ${filter === f ? C.accent : C.border}`,
            background: filter === f ? `${C.accent}22` : "transparent", color: filter === f ? C.accent : C.sub,
            fontWeight: 600, fontSize: 13, cursor: "pointer", textTransform: "capitalize",
          }}>{f}</button>
        ))}
      </div>

      <Tarjeta style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {["Placa", "Propietario", "Tipo", "Puesto", "Ingreso", "Estado", "Acciones"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.sub, fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: .5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(v => (
                <tr key={v.placa} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "12px 16px", fontWeight: 700, fontFamily: "Syne" }}>{v.placa}</td>
                  <td style={{ padding: "12px 16px" }}>{v.nombre}</td>
                  <td style={{ padding: "12px 16px" }}><Etiqueta label={v.tipo} color={v.tipo === "mensual" ? "blue" : "green"} /></td>
                  <td style={{ padding: "12px 16px", color: C.sub }}>{v.puesto || "—"}</td>
                  <td style={{ padding: "12px 16px", color: C.sub, fontSize: 12 }}>{v.ingreso || "—"}</td>
                  <td style={{ padding: "12px 16px" }}><Etiqueta label={v.estado || "activo"} color={v.estado === "inactivo" ? "red" : "green"} /></td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Boton small variant="ghost" onClick={() => openView(v)}>Ver</Boton>
                      {canEdit && <Boton small variant="outline" onClick={() => openEdit(v)}>Editar</Boton>}
                      {canInactivate && <Boton small danger onClick={() => inactivar(v.placa, v.estado)}>{v.estado === "activo" ? "Inactivar" : "Activar"}</Boton>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p style={{ textAlign: "center", padding: 30, color: C.sub }}>No se encontraron vehículos.</p>}
        </div>
      </Tarjeta>

      {(modal === "create" || modal === "edit") && (
        <Modal title={modal === "create" ? "Registrar Vehículo" : "Editar Vehículo"} onClose={() => setModal(null)}>
          <FilaFormulario label="Placa (3 letras + 3 números)"><input value={form.placa || ""} onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })} maxLength={6} placeholder="ABC123" /></FilaFormulario>
          <FilaFormulario label="Nombre del propietario"><input value={form.nombre || ""} onChange={e => setForm({ ...form, nombre: e.target.value })} /></FilaFormulario>
          {modal === "create" && (
            <>
              <FilaFormulario label="Documento del propietario"><input value={form.doc || ""} onChange={e => setForm({ ...form, doc: e.target.value })} maxLength={12} /></FilaFormulario>
              <FilaFormulario label="Teléfono del propietario (si no existe)"><input value={form.telefono || ""} onChange={e => setForm({ ...form, telefono: e.target.value })} maxLength={10} placeholder="3001234567" /></FilaFormulario>
              <FilaFormulario label="Color"><input value={form.color || ""} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="Ej: Rojo" /></FilaFormulario>
            </>
          )}
          <FilaFormulario label="Tipo">
            <select value="mensual" disabled>
              <option value="mensual">Mensual (contrato)</option>
            </select>
          </FilaFormulario>
          {modal === "edit" && (
            <FilaFormulario label="Estado">
              <select
                value={form.estado || "activo"}
                onChange={e => setForm({ ...form, estado: e.target.value })}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </FilaFormulario>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Boton onClick={save} style={{ flex: 1 }}>Guardar</Boton>
            <Boton variant="ghost" onClick={() => setModal(null)} style={{ flex: 1 }}>Cancelar</Boton>
          </div>
        </Modal>
      )}

      {modal === "view" && selected && (
        <Modal title="Detalle del Vehículo" onClose={() => setModal(null)}>
          {[["Placa", selected.placa], ["Propietario", selected.nombre], ["Tipo", selected.tipo], ["Estado", selected.estado || "activo"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.sub, fontSize: 13 }}>{k}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
