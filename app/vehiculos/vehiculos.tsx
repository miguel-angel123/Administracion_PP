"use client";

import { useCallback, useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { Boton, Tarjeta, Etiqueta, Modal, FilaFormulario } from "@/lib/componentes";
import { useAuth } from "@/lib/auth";
import { alertaError, alertaExito, alertaAdvertencia, confirmar } from "@/lib/alerta";
import { esPlacaValida, esDocumentoValido, esTelefonoValido, sinAngular } from "@/lib/validacion";
import { fetchSeguro } from "@/lib/fetchSeguro";
import { useLiveData } from "@/lib/live/useLiveData";

interface VehiculoDB {
  placa: string;
  doc?: string;
  telefono?: string;
  color?: string;
  nombre: string;
  tipo: string; // "mensual" o "diario"
  clase_vehiculo?: string; // "carro", "moto", "camion", "bus"
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
  vehiculoActual?: VehiculoDB; // Datos del vehículo si está ocupado
}

export default function VehiculosPage() {
  const { user } = useAuth();
  
  // Estados de Datos
  const [puestos, setPuestos] = useState<PuestoDB[]>([]);
  const [inactivos, setInactivos] = useState<VehiculoDB[]>([]);
  
  // Estados de Modales y Formularios
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<VehiculoDB | null>(null);
  const [form, setForm] = useState<Partial<VehiculoDB>>({});
  const [reactivando, setReactivando] = useState(false);
  const [papeleraAbierta, setPapeleraAbierta] = useState(false);

  // Permisos según rol
  const canCreate = user?.role === "gerente";
  const canEdit = user?.role === "gerente";
  const canInactivate = user?.role === "gerente";

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

  useLiveData(() => {
    loadPuestos();
  }, 8000);

  useEffect(() => {
    loadPuestos();
    if (canInactivate) loadInactivos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const puestosLibres = puestos.filter(p =>
    !p.estado_puesto || String(p.numero_puesto) === String(form.puesto)
  );

  const openCreate = () => {
    setForm({ 
      placa: "", nombre: "", doc: "", telefono: "", color: "", 
      tipo: "mensual", clase_vehiculo: "carro", puestoSeleccionado: "" 
    });
    setReactivando(false);
    setModal("create");
  };

  const openEdit = (v: VehiculoDB) => { 
    setForm({ ...v, puestoSeleccionado: "" }); 
    setSelected(v);
    setReactivando(false);
    setModal("edit"); 
  };
  
  const openView = (v: VehiculoDB) => { 
    setSelected(v); 
    setModal("view"); 
  };

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
          tipo: form.tipo || "mensual",
          clase_vehiculo: form.clase_vehiculo || "carro",
          puestosIdPuesto: Number(form.puestoSeleccionado),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alertaError(data.error || "No se pudo registrar el vehículo");
        return;
      }
      alertaExito("Vehículo registrado y asignado al puesto.");
    } else {
      if (!sinAngular(form.nombre || "")) {
        alertaAdvertencia("El nombre contiene caracteres no permitidos (< >)");
        return;
      }

      const putBody: Record<string, unknown> = {
        color: form.color || "",
        clase_vehiculo: form.clase_vehiculo,
      };
      if (form.nombre?.trim()) putBody.nombre = form.nombre.trim();

      // Reactivar es un PATCH de edición: el vehículo inactivo ya no tiene
      // puesto en BD, así que el puesto elegido es obligatorio y viaja junto
      // al cambio de estado.
      if (reactivando) {
        if (!form.puestoSeleccionado) {
          alertaAdvertencia("Debe asignar un puesto libre al reactivar el vehículo");
          return;
        }
        putBody.estado = "activo";
        putBody.puestosIdPuesto = Number(form.puestoSeleccionado);
      } else if (form.puestoSeleccionado) {
        putBody.puestosIdPuesto = Number(form.puestoSeleccionado);
      }

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
      alertaExito(reactivando ? "Vehículo reactivado." : "Vehículo actualizado.");
    }
    setModal(null);
    setReactivando(false);
    await loadPuestos();
    await loadInactivos();
  };

  const inactivar = async (placa: string) => {
    const ok = await confirmar(
      `¿Enviar el vehículo ${placa} a la papelera y liberar su puesto?`, 
      "Inactivar vehículo", 
      "Sí, inactivar"
    );
    if (!ok) return;

    const res = await fetchSeguro(`/api/vehiculos/${placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // El modelo desvincula el puesto del contrato al pasar a "inactivo";
      // enviar puestosIdPuesto: null aquí sólo duplicaba esa responsabilidad.
      body: JSON.stringify({ estado: "inactivo" }),
    });

    const data = await res.json();
    if (!res.ok) {
      alertaError(data.error || "No se pudo inactivar el vehículo");
      return;
    }
    alertaExito("Vehículo enviado a papelera y puesto liberado.");
    setModal(null);
    await loadPuestos();
    await loadInactivos();
  };

  // --- LÓGICA DE DRAG AND DROP (MAPA INTERACTIVO) ---
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, placa: string) => {
    e.dataTransfer.setData("placa", placa);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetPuestoId: string, ocupado: boolean) => {
    e.preventDefault();
    const placa = e.dataTransfer.getData("placa");
    if (!placa) return;

    if (ocupado) {
      alertaAdvertencia("Este puesto ya está ocupado");
      return;
    }

    const ok = await confirmar(`¿Mover vehículo ${placa} a este puesto?`, "Mover Vehículo", "Sí, mover");
    if (!ok) return;

    const res = await fetchSeguro(`/api/vehiculos/${placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puestosIdPuesto: Number(targetPuestoId) }),
    });

    if (!res.ok) {
      const data = await res.json();
      alertaError(data.error || "Error al mover el vehículo");
      return;
    }

    alertaExito("Vehículo movido con éxito.");
    await loadPuestos();
  };

  const obtenerIconoClase = (clase?: string) => {
    switch (clase) {
      case "moto": return "🏍️";
      case "bus": return "🚌";
      case "camion": return "🚚";
      case "carro":
      default: return "🚗";
    }
  };

  // Estadísticas rápidas
  const puestosOcupados = puestos.filter(p => p.estado_puesto).length;
  const puestosTotales = puestos.length;

  return (
    <div>
      {/* HEADER DE LA PÁGINA */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Mapa del Parqueadero</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>
            Ocupación: {puestosOcupados} / {puestosTotales} puestos
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {canInactivate && (
            <Boton 
              variant="outline" 
              onClick={async () => { await loadInactivos(); setPapeleraAbierta(true); }}
            >
              🗑️ Papelera {inactivos.length > 0 && `(${inactivos.length})`}
            </Boton>
          )}
          {canCreate && <Boton onClick={openCreate}>+ Registrar Vehículo</Boton>}
        </div>
      </div>

      {/* VISTA MAPA INTERACTIVO */}
      <Tarjeta style={{ background: C.surface, padding: 24 }}>
        <p style={{ color: C.sub, fontSize: 14, marginBottom: 20 }}>
          Arrastra los vehículos para moverlos de puesto. Haz clic en un vehículo para ver sus detalles o enviarlo a la papelera.
        </p>
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", 
          gap: 16 
        }}>
          {puestos.map(p => {
            const ocupado = p.estado_puesto && p.vehiculoActual;
            
            return (
              <div
                key={p.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, p.id, Boolean(ocupado))}
                style={{
                  border: `2px dashed ${ocupado ? "transparent" : C.border}`,
                  background: ocupado ? "rgba(0,0,0,0.02)" : "transparent",
                  borderRadius: 12,
                  height: 120,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  transition: "all 0.2s"
                }}
              >
                <span style={{ position: "absolute", top: 8, left: 10, fontSize: 12, fontWeight: 700, color: C.sub }}>
                  P-{p.numero_puesto}
                </span>
                
                {ocupado && p.vehiculoActual ? (
                  <div
                    draggable={canEdit}
                    onDragStart={(e) => handleDragStart(e, p.vehiculoActual!.placa)}
                    onClick={() => openView(p.vehiculoActual!)}
                    title="Haz clic para ver detalles"
                    style={{
                      background: p.vehiculoActual.tipo === "mensual" ? "#e0f2fe" : "#dcfce3",
                      border: `1px solid ${p.vehiculoActual.tipo === "mensual" ? "#38bdf8" : "#4ade80"}`,
                      borderRadius: 8,
                      padding: "12px",
                      width: "85%",
                      textAlign: "center",
                      cursor: canEdit ? "grab" : "pointer",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4
                    }}
                  >
                    <span style={{ fontSize: 24, lineHeight: 1 }}>
                      {obtenerIconoClase(p.vehiculoActual.clase_vehiculo)}
                    </span>
                    <span style={{ fontWeight: 700, fontFamily: "Syne", fontSize: 14, color: "#1e293b" }}>
                      {p.vehiculoActual.placa}
                    </span>
                    <span style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", fontWeight: 600 }}>
                      {p.vehiculoActual.tipo}
                    </span>
                  </div>
                ) : (
                  <span style={{ color: C.sub, fontSize: 13 }}>Libre</span>
                )}
              </div>
            );
          })}
        </div>
      </Tarjeta>

      {/* MODAL CREAR / EDITAR */}
      {(modal === "create" || modal === "edit") && (
        <Modal
          title={
            modal === "create" ? "Registrar Vehículo"
            : reactivando ? "Reactivar Vehículo"
            : "Editar Vehículo"
          }
          onClose={() => setModal(null)}
        >
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
              <FilaFormulario label="Teléfono del propietario (opcional)">
                <input value={form.telefono || ""} onChange={e => setForm({ ...form, telefono: e.target.value })} maxLength={10} placeholder="3001234567" />
              </FilaFormulario>
              <FilaFormulario label="Tipo de cliente">
                <select value={form.tipo || "mensual"} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                  <option value="mensual">Mensual (Contrato)</option>
                  <option value="diario">Diario (Ticket)</option>
                </select>
              </FilaFormulario>
            </>
          )}

          <FilaFormulario label="Clase de Vehículo">
            <select value={form.clase_vehiculo || "carro"} onChange={e => setForm({ ...form, clase_vehiculo: e.target.value })}>
              <option value="carro">🚗 Carro</option>
              <option value="moto">🏍️ Moto</option>
              <option value="camion">🚚 Camión</option>
              <option value="bus">🚌 Bus</option>
            </select>
          </FilaFormulario>

          <FilaFormulario label="Color">
            <input value={form.color || ""} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="Ej: Rojo" />
          </FilaFormulario>

          {modal === "create" && (
            <FilaFormulario label="Puesto a asignar">
              <select value={form.puestoSeleccionado || ""} onChange={e => setForm({ ...form, puestoSeleccionado: e.target.value })}>
                <option value="">Seleccione un puesto libre…</option>
                {puestosLibres.map(p => <option key={p.id} value={p.id}>Puesto {p.numero_puesto}</option>)}
              </select>
            </FilaFormulario>
          )}

          {modal === "edit" && (
            <FilaFormulario label="Puesto asignado">
              <select value={form.puestoSeleccionado || ""} onChange={e => setForm({ ...form, puestoSeleccionado: e.target.value })}>
                <option value="">
                  {reactivando ? "Seleccione un puesto libre…" : `Mantener puesto actual (${form.puesto || "—"})`}
                </option>
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

      {/* MODAL VER DETALLE (Con botón de Inactivar) */}
      {modal === "view" && selected && (
        <Modal title="Detalle del Vehículo" onClose={() => setModal(null)}>
          {([
            ["Placa", selected.placa],
            ["Clase", selected.clase_vehiculo ? obtenerIconoClase(selected.clase_vehiculo) + " " + selected.clase_vehiculo : "🚗 Carro"],
            ["Tipo", selected.tipo],
            ["Color", selected.color || "—"],
            ["Propietario", selected.nombre],
            ["Documento", selected.doc || "—"],
            ["Teléfono", selected.telefono || "—"],
            ["Puesto Actual", selected.puesto || "—"],
            [selected.tipo === "mensual" ? "Inicio contrato" : "Ingreso", selected.ingreso || "—"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.sub, fontSize: 13 }}>{k}</span>
              <span style={{ fontWeight: 600, fontSize: 13, textAlign: "right", marginLeft: 12 }}>{v}</span>
            </div>
          ))}
          
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            {canEdit && (
              <Boton variant="outline" onClick={() => openEdit(selected)} style={{ flex: 1 }}>
                ✏️ Editar
              </Boton>
            )}
            {canInactivate && selected.tipo === "mensual" && (
              <Boton danger onClick={() => inactivar(selected.placa)} style={{ flex: 1 }}>
                🗑️ Inactivar
              </Boton>
            )}
          </div>
        </Modal>
      )}

      {/* MODAL PAPELERA (Historial de inactivos) */}
      {papeleraAbierta && (
        <Modal title="Vehículos Inactivados (Contratos)" onClose={() => setPapeleraAbierta(false)}>
          {inactivos.length === 0 ? (
            <p style={{ color: C.sub, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No hay vehículos inactivados en la papelera.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {inactivos.map(v => (
                <div key={v.placa} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "rgba(0,0,0,0.02)", borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{obtenerIconoClase(v.clase_vehiculo)}</span>
                      <p style={{ fontWeight: 700, fontFamily: "Syne", fontSize: 16 }}>{v.placa}</p>
                      <Etiqueta label="Inactivo" color="red" />
                    </div>
                    <p style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Propietario: {v.nombre}</p>
                    <p style={{ color: C.sub, fontSize: 12 }}>Último puesto conocido: {v.puesto || "Ninguno"}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Boton small variant="outline" onClick={async () => {
                        const ok = await confirmar(`¿Reactivar el vehículo ${v.placa}? Tendrás que asignarle un puesto.`, "Reactivar", "Sí, reactivar");
                        if (!ok) return;
                        
                        // Reactivar exige puesto nuevo: el modelo lo desvinculó al
                        // inactivar, por eso el modal de edición arranca sin selección.
                        setPapeleraAbierta(false);
                        setSelected(v);
                        setForm({ ...v, estado: "activo", puestoSeleccionado: "" });
                        setReactivando(true);
                        setModal("edit");
                      }}>
                      Reactivar
                    </Boton>
                    <Boton small danger onClick={async () => {
                        const ok = await confirmar(`¿Eliminar definitivamente la placa ${v.placa}?`, "Eliminar de base de datos", "Sí, eliminar");
                        if (!ok) return;
                        const res = await fetchSeguro(`/api/vehiculos/${v.placa}`, { method: "DELETE" });
                        if (!res.ok) { alertaError("No se pudo eliminar"); return; }
                        alertaExito("Vehículo eliminado permanentemente.");
                        await loadInactivos();
                      }}>
                      Borrar
                    </Boton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
