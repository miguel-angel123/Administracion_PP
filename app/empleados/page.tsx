"use client";

import { useCallback, useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { Boton, Tarjeta, Etiqueta, Modal, FilaFormulario } from "@/lib/componentes";
import { useAuth } from "@/lib/auth";
import { alertaError, alertaExito, alertaAdvertencia, confirmar } from "@/lib/alerta";
import { esDocumentoValido, esTelefonoValido, esCorreoValido, sinAngular } from "@/lib/validacion";
import { fetchSeguro } from "@/lib/fetchSeguro";
import { useDebounce } from "@/lib/useDebounce";

interface EmpleadoDB {
  doc: string;
  nombre: string;
  cargo: string;
  telefono: string;
  correo: string;
  estado: string;
}

interface RespuestaPaginada<T> {
  datos: T[];
  total: number;
  pagina: number;
  tamano: number;
  totalPaginas: number;
}

const TAMANO = 20;

export default function EmpleadosPage() {
  const { user } = useAuth();
  const [empleados, setEmpleados] = useState<EmpleadoDB[]>([]);
  const [modal, setModal] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<EmpleadoDB>>({});
  const [search, setSearch] = useState("");
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const searchDebounced = useDebounce(search, 300);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      rol: "empleado",
      pagina: String(pagina),
      tamano: String(TAMANO),
    });
    if (searchDebounced.trim()) params.set("buscar", searchDebounced.trim());

    const res = await fetch(`/api/usuarios?${params.toString()}`);
    const data: RespuestaPaginada<EmpleadoDB> = await res.json();
    setEmpleados(Array.isArray(data.datos) ? data.datos : []);
    setTotal(data.total ?? 0);
    setTotalPaginas(data.totalPaginas ?? 1);
  }, [pagina, searchDebounced]);

  useEffect(() => { load(); }, [load]);

  const cambiarBusqueda = (v: string) => { setSearch(v); setPagina(1); };

  const openCreate = () => {
    setForm({ doc: "", nombre: "", cargo: "Vigilante", telefono: "", correo: "", estado: "trabajando" });
    setModal("create");
  };

  const openEdit = (e: EmpleadoDB) => { setForm({ ...e }); setModal("edit"); };

  const save = async () => {
    if (!esDocumentoValido(form.doc || "")) {
      alertaAdvertencia("El documento debe tener entre 6 y 12 dígitos");
      return;
    }
    if (!sinAngular(form.nombre || "")) {
      alertaAdvertencia("El nombre contiene caracteres no permitidos");
      return;
    }
    if (form.telefono && !esTelefonoValido(form.telefono)) {
      alertaAdvertencia("El teléfono debe tener 10 dígitos");
      return;
    }
    if (form.correo && !esCorreoValido(form.correo)) {
      alertaAdvertencia("Correo electrónico inválido");
      return;
    }

    const esCrear = modal === "create";

    const res = esCrear
      ? await fetchSeguro("/api/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, password: "123456" }),
        })
      : await fetchSeguro(`/api/usuarios/${form.doc}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: form.nombre,
            cargo: form.cargo,
            telefono: form.telefono,
            correo: form.correo,
            estado: form.estado,
          }),
        });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alertaError(data.error || "No se pudo guardar el empleado");
      return;
    }

    setModal(null);
    await load();
    alertaExito(esCrear ? "Empleado creado." : "Empleado actualizado.");
  };

  const inactivar = async (doc: string) => {
    const emp = empleados.find(e => e.doc === doc);
    const activando = emp?.estado === "inactivo";

    const ok = await confirmar(
      activando ? `¿Reactivar a ${emp?.nombre}?` : `¿Inactivar a ${emp?.nombre}?`,
      activando ? "Reactivar empleado" : "Inactivar empleado",
      activando ? "Sí, reactivar" : "Sí, inactivar"
    );
    if (!ok) return;

    const res = await fetchSeguro(`/api/usuarios/${doc}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estado: activando ? "trabajando" : "inactivo",
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alertaError(data.error || "No se pudo actualizar el estado");
      return;
    }

    await load();
    alertaExito(activando ? "Empleado reactivado." : "Empleado inactivado.");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Empleados</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>RF 2.4 · RF 2.5 · RF 3.0 — {total} registros</p>
        </div>
        {user?.role === "gerente" && <Boton onClick={openCreate}>+ Nuevo Empleado</Boton>}
      </div>

      <input value={search} onChange={e => cambiarBusqueda(e.target.value)} placeholder="Buscar empleado…" style={{ maxWidth: 300, marginBottom: 16 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {empleados.map(emp => (
          <Tarjeta key={emp.doc}>
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
                <Boton small danger onClick={() => inactivar(emp.doc)}>{emp.estado === "inactivo" ? "Activar" : "Inactivar"}</Boton>
              </div>
            )}
          </Tarjeta>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <span style={{ fontSize: 13, color: C.sub }}>
          Página {pagina} de {totalPaginas} ({total} empleados)
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Boton small variant="ghost" disabled={pagina <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</Boton>
          <Boton small variant="ghost" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Siguiente</Boton>
        </div>
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
            <Boton onClick={save} data-nav-submit style={{ flex: 1 }}>Guardar</Boton>
            <Boton variant="ghost" onClick={() => setModal(null)} style={{ flex: 1 }}>Cancelar</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
