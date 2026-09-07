"use client";

import { useState } from "react";
import { C } from "@/lib/tema";
import { Boton, Tarjeta, Etiqueta, Modal, FilaFormulario } from "@/lib/componentes";
import { useAuth } from "@/lib/auth";
import { EMPLEADOS_INIT, type Empleado } from "@/lib/datos";

export default function EmpleadosPage() {
  const { user } = useAuth();
  const [empleados, setEmpleados] = useState<Empleado[]>(EMPLEADOS_INIT);
  const [modal, setModal] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Empleado>>({});
  const [search, setSearch] = useState("");

  const visible = empleados.filter(e => e.nombre.toLowerCase().includes(search.toLowerCase()) || e.doc.includes(search));

  const openCreate = () => {
    setForm({ doc: "", nombre: "", cargo: "Vigilante", telefono: "", correo: "", estado: "trabajando" });
    setModal("create");
  };

  const openEdit = (e: Empleado) => { setForm({ ...e }); setModal("edit"); };

  const save = () => {
    if (modal === "create") setEmpleados(prev => [...prev, { ...form, id: Date.now() } as Empleado]);
    else setEmpleados(prev => prev.map(e => e.id === form.id ? form as Empleado : e));
    setModal(null);
  };

  const inactivar = (id: number) => setEmpleados(prev => prev.map(e => e.id === id ? { ...e, estado: e.estado === "inactivo" ? "trabajando" : "inactivo" } : e));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Empleados</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>RF 2.4 · RF 2.5 · RF 3.0</p>
        </div>
        {user?.role === "gerente" && <Boton onClick={openCreate}>+ Nuevo Empleado</Boton>}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado…" style={{ maxWidth: 300, marginBottom: 16 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {visible.map(emp => (
          <Tarjeta key={emp.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: `${C.accent}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>👷</div>
              <Etiqueta label={emp.estado} color={emp.estado === "trabajando" ? "green" : emp.estado === "descansando" ? "blue" : "red"} />
            </div>
            <h3 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{emp.nombre}</h3>
            <p style={{ color: C.accent, fontSize: 13, marginBottom: 10 }}>{emp.cargo}</p>
            <div style={{ fontSize: 13, color: C.sub }}>
              <p>📄 {emp.doc}</p>
              <p>📞 {emp.telefono}</p>
              <p>✉️ {emp.correo}</p>
            </div>
            {user?.role === "gerente" && (
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <Boton small variant="outline" onClick={() => openEdit(emp)}>Editar</Boton>
                <Boton small danger onClick={() => inactivar(emp.id)}>{emp.estado === "inactivo" ? "Activar" : "Inactivar"}</Boton>
              </div>
            )}
          </Tarjeta>
        ))}
      </div>

      {(modal === "create" || modal === "edit") && (
        <Modal title={modal === "create" ? "Crear Empleado" : "Editar Empleado"} onClose={() => setModal(null)}>
          <FilaFormulario label="Documento"><input value={form.doc || ""} onChange={e => setForm({ ...form, doc: e.target.value })} maxLength={12} /></FilaFormulario>
          <FilaFormulario label="Nombre"><input value={form.nombre || ""} onChange={e => setForm({ ...form, nombre: e.target.value })} /></FilaFormulario>
          <FilaFormulario label="Cargo">
            <select value={form.cargo || ""} onChange={e => setForm({ ...form, cargo: e.target.value })}>
              <option>Vigilante</option><option>Operativo</option><option>Supervisor</option>
            </select>
          </FilaFormulario>
          <FilaFormulario label="Teléfono"><input value={form.telefono || ""} onChange={e => setForm({ ...form, telefono: e.target.value })} maxLength={10} /></FilaFormulario>
          <FilaFormulario label="Correo"><input value={form.correo || ""} onChange={e => setForm({ ...form, correo: e.target.value })} type="email" /></FilaFormulario>
          <FilaFormulario label="Estado">
            <select value={form.estado || ""} onChange={e => setForm({ ...form, estado: e.target.value })}>
              <option value="trabajando">Trabajando</option><option value="descansando">Descansando</option><option value="inactivo">Inactivo</option>
            </select>
          </FilaFormulario>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Boton onClick={save} style={{ flex: 1 }}>Guardar</Boton>
            <Boton variant="ghost" onClick={() => setModal(null)} style={{ flex: 1 }}>Cancelar</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
