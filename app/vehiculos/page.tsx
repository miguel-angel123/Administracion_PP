"use client";

import { useCallback, useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { Boton, Tarjeta, Etiqueta, Modal, FilaFormulario } from "@/lib/componentes";
import { useAuth } from "@/lib/auth";
import { alertaError, alertaExito, alertaAdvertencia, confirmar } from "@/lib/alerta";
import { esPlacaValida, esDocumentoValido, esTelefonoValido, sinAngular } from "@/lib/validacion";
import { fetchSeguro } from "@/lib/fetchSeguro";
import { useDebounce } from "@/lib/useDebounce";

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
  puestoSeleccionado?: string;
}

interface PuestoDB {
  id: string;
  numero_puesto: number;
  estado_puesto: boolean;
}

interface RespuestaPaginada<T> {
  datos: T[];
  total: number;
  pagina: number;
  tamano: number;
  totalPaginas: number;
}

const TAMANO = 20;

export default function VehiculosPage() {
  const { user } = useAuth();
  const [vehiculos, setVehiculos] = useState<VehiculoDB[]>([]);
  const [puestos, setPuestos] = useState<PuestoDB[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<VehiculoDB | null>(null);
  const [form, setForm] = useState<Partial<VehiculoDB>>({});
  const [papeleraAbierta, setPapeleraAbierta] = useState(false);
  const [inactivos, setInactivos] = useState<VehiculoDB[]>([]);

  const searchDebounced = useDebounce(search, 300);

  const canCreate = user?.role === "gerente";
  const canEdit = user?.role === "gerente";
  const canInactivate = user?.role === "gerente";

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      pagina: String(pagina),
      tamano: String(TAMANO),
      filtro: filter,
    });
    if (searchDebounced.trim()) params.set("buscar", searchDebounced.trim());

    const res = await fetch(`/api/vehiculos?${params.toString()}`);
    const data: RespuestaPaginada<VehiculoDB> = await res.json();
    setVehiculos(Array.isArray(data.datos) ? data.datos : []);
    setTotal(data.total ?? 0);
    setTotalPaginas(data.totalPaginas ?? 1);
  }, [pagina, filter, searchDebounced]);

  const loadPuestos = async () => {
    const res = await fetch("/api/vehiculos?recurso=puestos");
    const data = await res.json();
    if (Array.isArray(data)) setPuestos(data);
  };

  const loadInactivos = async () => {
    const res = await fetch("/api/vehiculos?recurso=papelera");
    const data = await res.json();
    if (Array.isArray(data)) setInactivos(data);
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPuestos(); loadInactivos(); }, []);

  // Puestos libres + el actual (para poder verlo seleccionado sin forzar cambio).
  const puestosLibres = puestos.filter(p =>
    !p.estado_puesto || String(p.numero_puesto) === String(form.puesto)
  );

  const cambiarBusqueda = (v: string) => { setSearch(v); setPagina(1); };
  const cambiarFiltro = (f: string) => { setFilter(f); setPagina(1); };

  const openCreate = () => {
    setForm({ placa: "", nombre: "", doc: "", telefono: "", color: "", tipo: "mensual", puestoSeleccionado: "" });
    setModal("create");
  };

  const openEdit = (v: VehiculoDB) => { setForm({ ...v, puestoSeleccionado: "" }); setSelected(v); setModal("edit"); };
  const openView = (v: VehiculoDB) => { setSelected(v); setModal("view"); };

  const save = async () => {
    if (modal === "create") {
      if (!esPlacaValida(form.placa || "")) {
        alertaAdvertencia("La placa debe tener 3 letras y 3 números (ej. ABC123)");
        return;
      }
      if (!esDocumentoValido(form.doc || "")) {
        alertaAdvertencia("El documento del propietario debe tener entre 6 y 12 dígitos");
        return;
      }
      if (form.telefono && !esTelefonoValido(form.telefono)) {
        alertaAdvertencia("El teléfono debe tener 10 dígitos");
        return;
      }
      if (!sinAngular(form.nombre || "") || !sinAngular(form.color || "")) {
        alertaAdvertencia("Nombre o color contienen caracteres no permitidos (< >)");
        return;
      }
      if (!form.puestoSeleccionado) {
        alertaAdvertencia("Debe asignar un puesto libre al contrato");
        return;
      }

      const res = await fetchSeguro("/api/vehiculos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: form.placa?.toUpperCase(),
          doc: form.doc,
          nombre: form.nombre,
          telefono: form.telefono,
          color: form.color || "No especificado",
          tipo: "mensual",
          puestosIdPuesto: Number(form.puestoSeleccionado),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alertaError(data.error || "No se pudo registrar el vehículo");
        return;
      }
      alertaExito("Vehículo registrado.");
    } else {
      // Validación específica de edición.
      if (!sinAngular(form.nombre || "")) {
        alertaAdvertencia("El nombre contiene caracteres no permitidos (< >)");
        return;
      }

      // En edición se envían los campos editables: estado, color, nombre y puesto.
      const putBody: Record<string, unknown> = {
        estado: form.estado || "activo",
        color: form.color || "",
      };
      if (form.nombre?.trim()) putBody.nombre = form.nombre.trim();
      if (form.puestoSeleccionado) putBody.puestosIdPuesto = Number(form.puestoSeleccionado);

      const res = await fetchSeguro(`/api/vehiculos/${form.placa}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(putBody),
      });
      const data = await res.json();
      if (!res.ok) {
        alertaError(data.error || "No se pudo actualizar");
        return;
      }
      alertaExito("Vehículo actualizado.");
    }
    setModal(null);
    await load();
    await loadPuestos();
    await loadInactivos();
  };

  const inactivar = async (placa: string, estadoActual?: string) => {
    const activando = estadoActual === "inactivo";
    const ok = await confirmar(
      activando ? `¿Reactivar el vehículo ${placa}?` : `¿Inactivar el vehículo ${placa}?`,
      activando ? "Reactivar vehículo" : "Inactivar vehículo",
      activando ? "Sí, reactivar" : "Sí, inactivar"
    );
    if (!ok) return;

    const nuevoEstado = activando ? "activo" : "inactivo";

    const res = await fetchSeguro(`/api/vehiculos/${placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado }),
    });

    const data = await res.json();
    if (!res.ok) {
      alertaError(data.error || "No se pudo actualizar el vehículo");
      return;
    }

    await load();
    await loadPuestos();
    await loadInactivos();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Vehículos</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>RF 2.2 · RF 2.3 · RF 3.2 — {total} registros</p>
        </div>
        {canCreate && <Boton onClick={openCreate}>+ Registrar Vehículo</Boton>}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={e => cambiarBusqueda(e.target.value)} placeholder="Buscar por placa o nombre…" style={{ maxWidth: 280 }} />
        {["todos", "mensual", "diario", "activo", "inactivo"].map(f => (
          <button key={f} onClick={() => cambiarFiltro(f)} style={{
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
              {vehiculos.map(v => (
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
          {vehiculos.length === 0 && <p style={{ textAlign: "center", padding: 30, color: C.sub }}>No se encontraron vehículos.</p>}
        </div>
      </Tarjeta>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button
          onClick={async () => { await loadInactivos(); setPapeleraAbierta(true); }}
          title="Vehículos inactivados con contrato"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 16px", borderRadius: 10,
            background: C.surface, border: `1px solid ${C.border}`,
            color: C.sub, fontSize: 13, cursor: "pointer",
          }}
        >
          🗑️ Vehículos inactivados
          {inactivos.length > 0 && (
            <span style={{
              background: C.red, color: "#fff", borderRadius: 99,
              padding: "1px 8px", fontSize: 11, fontWeight: 700,
            }}>{inactivos.length}</span>
          )}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <span style={{ fontSize: 13, color: C.sub }}>
          Página {pagina} de {totalPaginas} ({total} vehículos)
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Boton small variant="ghost" disabled={pagina <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</Boton>
          <Boton small variant="ghost" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Siguiente</Boton>
        </div>
      </div>

      {(modal === "create" || modal === "edit") && (
        <Modal title={modal === "create" ? "Registrar Vehículo" : "Editar Vehículo"} onClose={() => setModal(null)}>
          <FilaFormulario label="Placa">
            <input
              value={form.placa || ""}
              onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })}
              maxLength={6}
              placeholder="ABC123"
              disabled={modal === "edit"}
            />
          </FilaFormulario>

          <FilaFormulario label="Nombre del propietario">
            <input value={form.nombre || ""} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          </FilaFormulario>

          {modal === "create" && (
            <>
              <FilaFormulario label="Documento del propietario">
                <input value={form.doc || ""} onChange={e => setForm({ ...form, doc: e.target.value })} maxLength={12} />
              </FilaFormulario>
              <FilaFormulario label="Teléfono del propietario (si no existe)">
                <input value={form.telefono || ""} onChange={e => setForm({ ...form, telefono: e.target.value })} maxLength={10} placeholder="3001234567" />
              </FilaFormulario>
            </>
          )}

          <FilaFormulario label="Color">
            <input value={form.color || ""} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="Ej: Rojo" />
          </FilaFormulario>

          {modal === "create" && (
            <FilaFormulario label="Puesto asignado (contrato)">
              <select value={form.puestoSeleccionado || ""} onChange={e => setForm({ ...form, puestoSeleccionado: e.target.value })}>
                <option value="">Seleccione un puesto libre…</option>
                {puestosLibres.map(p => <option key={p.id} value={p.id}>Puesto {p.numero_puesto}</option>)}
              </select>
            </FilaFormulario>
          )}

          {modal === "edit" && (
            <FilaFormulario label="Estado">
              <select value={form.estado || "activo"} onChange={e => setForm({ ...form, estado: e.target.value })}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </FilaFormulario>
          )}

          {modal === "edit" && form.tipo === "mensual" && (
            <FilaFormulario label="Puesto del contrato">
              <select value={form.puestoSeleccionado || ""} onChange={e => setForm({ ...form, puestoSeleccionado: e.target.value })}>
                <option value="">Mantener puesto actual ({form.puesto || "—"})</option>
                {puestosLibres.map(p => <option key={p.id} value={p.id}>Puesto {p.numero_puesto}</option>)}
              </select>
            </FilaFormulario>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Boton onClick={save} data-nav-submit style={{ flex: 1 }}>Guardar</Boton>
            <Boton variant="ghost" onClick={() => setModal(null)} style={{ flex: 1 }}>Cancelar</Boton>
          </div>
        </Modal>
      )}

      {modal === "view" && selected && (
        <Modal title="Detalle del Vehículo" onClose={() => setModal(null)}>
          {[["Placa", selected.placa], ["Propietario", selected.nombre], ["Tipo", selected.tipo], ["Puesto", selected.puesto || "—"], ["Estado", selected.estado || "activo"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.sub, fontSize: 13 }}>{k}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span>
            </div>
          ))}
        </Modal>
      )}

      {papeleraAbierta && (
        <Modal title="Vehículos inactivados" onClose={() => setPapeleraAbierta(false)}>
          {inactivos.length === 0 ? (
            <p style={{ color: C.sub, fontSize: 13 }}>No hay vehículos inactivados.</p>
          ) : (
            inactivos.map(v => (
              <div key={v.placa} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderBottom: `1px solid ${C.border}`,
              }}>
                <div>
                  <p style={{ fontWeight: 700, fontFamily: "Syne", fontSize: 14 }}>{v.placa}</p>
                  <p style={{ color: C.sub, fontSize: 12 }}>{v.nombre} · Puesto {v.puesto || "—"}</p>
                  <Etiqueta label="inactivo" color="red" />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Boton
                    small
                    variant="outline"
                    onClick={async () => {
                      const ok = await confirmar(`¿Reactivar el vehículo ${v.placa}?`, "Reactivar", "Sí, reactivar");
                      if (!ok) return;
                      const res = await fetchSeguro(`/api/vehiculos/${v.placa}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ estado: "activo" }),
                      });
                      if (!res.ok) { alertaError("No se pudo reactivar"); return; }
                      alertaExito("Vehículo reactivado.");
                      await loadInactivos();
                      await load();
                      await loadPuestos();
                    }}
                  >
                    Activar
                  </Boton>
                  <Boton
                    small
                    danger
                    onClick={async () => {
                      const ok = await confirmar(
                        `¿Eliminar definitivamente ${v.placa}? Se conserva en el historial de la BD.`,
                        "Eliminar vehículo",
                        "Sí, eliminar"
                      );
                      if (!ok) return;
                      const res = await fetchSeguro(`/api/vehiculos/${v.placa}`, { method: "DELETE" });
                      if (!res.ok) { alertaError("No se pudo eliminar"); return; }
                      alertaExito("Vehículo eliminado del módulo.");
                      await loadInactivos();
                      await loadPuestos();
                    }}
                  >
                    Eliminar
                  </Boton>
                </div>
              </div>
            ))
          )}
        </Modal>
      )}
    </div>
  );
}
