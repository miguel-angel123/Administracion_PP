"use client";

import { useCallback, useEffect, useState } from "react";
import { C } from "@/lib/tema";
import { Boton, Tarjeta, Etiqueta, Modal, FilaFormulario } from "@/lib/componentes";
import { alertaError, alertaExito, alertaAdvertencia, confirmar } from "@/lib/alerta";
import { esPlacaValida, esDocumentoValido, esTelefonoValido, sinAngular } from "@/lib/validacion";
import { fetchSeguro } from "@/lib/fetchSeguro";
import { useDebounce } from "@/lib/useDebounce";

// Fila de la tabla de tickets (respuesta paginada del modelo).
type Ticket = {
  id: string;
  placa: string;
  propietario: string;
  entrada: string;
  salida: string;
  total: string;
  estado: string;
};

// Puesto del parqueadero para el selector del modal.
type Puesto = {
  id: string;
  numero_puesto: number;
  estado_puesto: boolean;
};

// Respuesta del endpoint /api/vehiculos/[placa]: indica si la placa ya existe
// y, de existir, su último puesto (para reutilizarlo si sigue libre).
type InfoVehiculo = {
  existe: boolean;
  ultimoPuesto: {
    puestos_id_puesto: number;
    numero_puesto: number;
    estado_puesto: boolean;
  } | null;
};

// Datos que arma el comprobante imprimible tras crear un ticket.
type TicketImpresion = {
  id: string;
  placa: string;
  propietario: string;
  documento: number | string;
  telefono: string | null;
  numero_puesto: number;
  entrada: string;
  modalidad: string;
  valor_hora: number | null;
  valor_dia: number | null;
  valor_mes: number | null;
};

interface RespuestaPaginada<T> {
  datos: T[];
  total: number;
  pagina: number;
  tamano: number;
  totalPaginas: number;
}

const TAMANO = 20;

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ placa: "", doc: "", telefono: "", puesto: "" });
  const [infoVehiculo, setInfoVehiculo] = useState<InfoVehiculo | null>(null);
  const [search, setSearch] = useState("");
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  // Ticket recién creado: al estar presente, se muestra la vista de impresión.
  const [ticketImpresion, setTicketImpresion] = useState<TicketImpresion | null>(null);

  const searchDebounced = useDebounce(search, 300);

  const loadTickets = useCallback(async () => {
    const params = new URLSearchParams({
      pagina: String(pagina),
      tamano: String(TAMANO),
    });
    if (searchDebounced.trim()) params.set("buscar", searchDebounced.trim());

    const res = await fetch(`/api/tickets?${params.toString()}`);
    const data: RespuestaPaginada<Ticket> = await res.json();
    setTickets(Array.isArray(data.datos) ? data.datos : []);
    setTotal(data.total ?? 0);
    setTotalPaginas(data.totalPaginas ?? 1);
  }, [pagina, searchDebounced]);

  const loadPuestos = async () => {
    const res = await fetch("/api/vehiculos?recurso=puestos");
    const data = await res.json();
    if (Array.isArray(data)) setPuestos(data);
  };

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => { loadPuestos(); }, []);

  // Solo puestos libres para evitar elegir uno ocupado.
  const libres = puestos.filter(p => !p.estado_puesto);

  const cambiarBusqueda = (v: string) => { setSearch(v); setPagina(1); };

  // Al escribir la placa, se consulta al backend si el vehículo existe.
  // Si existe y su último puesto está libre, se auto-selecciona.
  const onPlacaChange = async (valor: string) => {
    const placa = valor.toUpperCase();
    setForm(f => ({ ...f, placa }));

    if (placa.length < 6) {
      setInfoVehiculo(null);
      return;
    }

    const res = await fetch(`/api/vehiculos/${placa}`);
    if (!res.ok) {
      setInfoVehiculo(null);
      return;
    }
    const data = await res.json();
    setInfoVehiculo(data);

    if (data.existe && data.ultimoPuesto && !data.ultimoPuesto.estado_puesto) {
      setForm(f => ({ ...f, puesto: String(data.ultimoPuesto.numero_puesto) }));
    }
  };

  const crear = async () => {
    // Validaciones en cliente, con el mismo patrón que aplica el backend.
    if (!esPlacaValida(form.placa)) {
      alertaAdvertencia("La placa debe tener 3 letras y 3 números (ej. ABC123)");
      return;
    }
    if (!form.puesto) {
      alertaAdvertencia("Seleccione un puesto");
      return;
    }
    if (form.doc && !esDocumentoValido(form.doc)) {
      alertaAdvertencia("El documento debe tener entre 6 y 12 dígitos");
      return;
    }
    if (form.telefono && !esTelefonoValido(form.telefono)) {
      alertaAdvertencia("El teléfono debe tener 10 dígitos");
      return;
    }
    if (!sinAngular(form.doc) || !sinAngular(form.telefono)) {
      alertaAdvertencia("Caracteres no permitidos en el formulario");
      return;
    }

    const res = await fetchSeguro("/api/tickets", {
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
      alertaError(data.error || "No se pudo crear el ticket");
      return;
    }

    // Se consultan los datos completos del ticket para armar el comprobante.
    const detalleRes = await fetch(`/api/tickets/${data.id}`);
    if (detalleRes.ok) {
      setTicketImpresion(await detalleRes.json());
    }

    setModal(false);
    setForm({ placa: "", doc: "", telefono: "", puesto: "" });
    setInfoVehiculo(null);
    await loadTickets();
    await loadPuestos();
  };

  const cerrar = async (id: string) => {
    if (!(await confirmar("¿Cerrar y cobrar este ticket?", "Cerrar ticket", "Sí, cerrar"))) return;
    const res = await fetchSeguro(`/api/tickets/${id}`, { method: "PATCH" });
    const data = await res.json();
    if (!res.ok) {
      alertaError(data.error || "No se pudo cerrar el ticket");
      return;
    }
    if (data.valorTotal) {
      alertaExito(`Ticket cerrado. Valor a pagar: $${data.valorTotal}`, "Ticket cerrado");
    }
    await loadTickets();
    await loadPuestos();
  };

  const finalizar = async (id: string) => {
    if (!(await confirmar(
      "¿Finalizar este ticket? El vehículo quedará inactivo y el puesto quedará libre.",
      "Finalizar ticket",
      "Sí, finalizar"
    ))) return;

    const res = await fetchSeguro(`/api/tickets/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alertaError(data.error || "No se pudo finalizar el ticket");
      return;
    }
    alertaExito("Ticket finalizado.");
    await loadTickets();
    await loadPuestos();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Tickets</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>RF 2.9 — {total} tickets</p>
        </div>
        <Boton onClick={() => setModal(true)}>+ Crear Ticket</Boton>
      </div>

      <input value={search} onChange={e => cambiarBusqueda(e.target.value)} placeholder="Buscar por placa o propietario…" style={{ maxWidth: 300, marginBottom: 16 }} />

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
                          <Boton small danger onClick={() => finalizar(t.id)}>Finalizar</Boton>
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <span style={{ fontSize: 13, color: C.sub }}>
          Página {pagina} de {totalPaginas} ({total} tickets)
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Boton small variant="ghost" disabled={pagina <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</Boton>
          <Boton small variant="ghost" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Siguiente</Boton>
        </div>
      </div>

      {modal && (
        <Modal title="Crear Ticket" onClose={() => setModal(false)}>
          <FilaFormulario label="Placa">
            <input
              value={form.placa}
              onChange={e => onPlacaChange(e.target.value)}
              maxLength={6}
              placeholder="ABC123"
            />
            {infoVehiculo?.existe && infoVehiculo.ultimoPuesto && (
              <p style={{ color: C.green, fontSize: 12, marginTop: 4 }}>
                ✔ Vehículo reconocido. Se reutilizará el puesto {infoVehiculo.ultimoPuesto.numero_puesto}
                {infoVehiculo.ultimoPuesto.estado_puesto ? " (ocupado actualmente, seleccione otro)" : ""}.
              </p>
            )}
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
            <select
              value={form.puesto}
              onChange={e => setForm({ ...form, puesto: e.target.value })}
              disabled={!!infoVehiculo?.existe && !infoVehiculo.ultimoPuesto?.estado_puesto}
            >
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
            <Boton onClick={crear} data-nav-submit style={{ flex: 1 }}>Crear</Boton>
            <Boton variant="ghost" onClick={() => setModal(false)} style={{ flex: 1 }}>Cancelar</Boton>
          </div>
        </Modal>
      )}

      {ticketImpresion && (
        <Modal
          title="Ticket creado"
          onClose={() => setTicketImpresion(null)}
        >
          {/* Vista previa del comprobante. El id lo usa el CSS de impresión. */}
          <div id="ticket-imprimible">
            <h3>LA PRADERA — PARQUEADERO</h3>
            <p className="sub">Comprobante de ingreso</p>
            <hr />
            <table>
              <tbody>
                <tr><td>Ticket</td><td>#{ticketImpresion.id}</td></tr>
                <tr><td>Placa</td><td>{ticketImpresion.placa}</td></tr>
                <tr><td>Propietario</td><td>{ticketImpresion.propietario}</td></tr>
                <tr><td>Documento</td><td>{ticketImpresion.documento}</td></tr>
                <tr><td>Teléfono</td><td>{ticketImpresion.telefono || "—"}</td></tr>
                <tr><td>Puesto</td><td>{ticketImpresion.numero_puesto}</td></tr>
                <tr><td>Ingreso</td><td>{ticketImpresion.entrada}</td></tr>
                <tr><td>Modalidad</td><td>{ticketImpresion.modalidad}</td></tr>
              </tbody>
            </table>
            <hr />
            <table>
              <tbody>
                <tr><td>Tarifa por hora</td><td>{ticketImpresion.valor_hora ? `$${ticketImpresion.valor_hora.toLocaleString("es-CO")}` : "—"}</td></tr>
                <tr><td>Tarifa por día</td><td>{ticketImpresion.valor_dia ? `$${ticketImpresion.valor_dia.toLocaleString("es-CO")}` : "—"}</td></tr>
                <tr><td>Tarifa mensual</td><td>{ticketImpresion.valor_mes ? `$${ticketImpresion.valor_mes.toLocaleString("es-CO")}` : "—"}</td></tr>
              </tbody>
            </table>
            <p className="pie">Conserve este ticket para la salida</p>
          </div>

          {/* Botones fuera del área imprimible: no salen en el papel. */}
          <div className="no-print" style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Boton onClick={() => window.print()} style={{ flex: 1 }}>Imprimir</Boton>
            <Boton variant="ghost" onClick={() => setTicketImpresion(null)} style={{ flex: 1 }}>Cerrar</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
