"use client";

import { useCallback, useState } from "react";
import { C } from "@/lib/tema";
import { Tarjeta, Etiqueta, Boton } from "@/lib/componentes";
import { useDebounce } from "@/lib/useDebounce";
import { useLiveData } from "@/lib/live/useLiveData";
import { alertaAdvertencia } from "@/lib/alerta";
import { filasACSV, descargarCSV, exportarReportePDF } from "@/lib/exportar";

interface LogEntry {
  id: number;
  tipo: string;
  usuario: string;
  accion: string;
  fecha: string;
}

interface Respuesta {
  datos: LogEntry[];
  total: number;
  pagina: number;
  tamano: number;
  totalPaginas: number;
}

type OrdenCol = "fecha" | "usuario" | "accion";

export default function RegistrosPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [search, setSearch] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamano] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [orden, setOrden] = useState<OrdenCol>("fecha");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const searchDebounced = useDebounce(search, 300);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        pagina: String(pagina),
        tamano: String(tamano),
        orden,
        dir,
      });
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (searchDebounced.trim()) params.set("buscar", searchDebounced.trim());

      const res = await fetch(`/api/registros?${params.toString()}`);
      if (!res.ok) return;

      const data: Respuesta = await res.json();
      setLogs(data.datos);
      setTotal(data.total);
      setTotalPaginas(data.totalPaginas);
    } catch {
      setLogs([]);
    }
  }, [pagina, desde, hasta, orden, dir, searchDebounced, tamano]);

  useLiveData(load, 5000);

  // Trae TODAS las filas filtradas (sin paginar). El backend ya soporta el modo
  // con paginado=0 y aplica el tope de 10 000.
  const fetchTodas = useCallback(async () => {
    const params = new URLSearchParams({ orden, dir, paginado: "0" });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (searchDebounced.trim()) params.set("buscar", searchDebounced.trim());

    const res = await fetch(`/api/registros?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.datos ?? []) as LogEntry[];
  }, [desde, hasta, orden, dir, searchDebounced]);

  const sufijoArchivo = () =>
    `_${desde || "inicio"}_${hasta || "hoy"}`;

  const exportarCSV = async () => {
    const filas = await fetchTodas();
    if (filas.length === 0) {
      alertaAdvertencia("No hay registros para exportar con los filtros actuales.");
      return;
    }
    const contenido = filasACSV(
      ["id", "tipo", "usuario", "accion", "fecha"],
      filas as unknown as Record<string, unknown>[]
    );
    descargarCSV(`registros${sufijoArchivo()}.csv`, contenido);
  };

  const exportarPDF = async () => {
    const filas = await fetchTodas();
    if (filas.length === 0) {
      alertaAdvertencia("No hay registros para exportar con los filtros actuales.");
      return;
    }
    const rango = desde || hasta
      ? `${desde || "inicio"} – ${hasta || "hoy"}`
      : "Sin filtro de fechas";

    await exportarReportePDF({
      titulo: "Registros del sistema",
      subtitulo: `Parqueadero La Pradera · ${rango} · ${filas.length} registros`,
      columnas: [
        { encabezado: "ID",      ancho: 40,  alinear: "center" },
        { encabezado: "Tipo",    ancho: 70,  alinear: "center" },
        { encabezado: "Usuario", ancho: 120 },
        { encabezado: "Acción",  ancho: 200 },
        { encabezado: "Fecha",   ancho: 90,  alinear: "center" },
      ],
      filas: filas.map(f => [f.id, f.tipo, f.usuario, f.accion, f.fecha]),
      nombreArchivo: `registros${sufijoArchivo()}`,
    });
  };

  const alternarOrden = (col: OrdenCol) => {
    if (orden === col) {
      setDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrden(col);
      setDir("desc");
    }
    setPagina(1);
  };

  const typeColor: Record<string, string> = {
    LOGIN: "blue", CREATE: "green", EDIT: "gold", INACTIVE: "red", TICKET: "green",
  };

  const flecha = (col: OrdenCol) => (orden === col ? (dir === "asc" ? " ▲" : " ▼") : "");

  const headerStyle: React.CSSProperties = {
    padding: "12px 16px",
    textAlign: "left",
    color: C.sub,
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: .5,
    borderBottom: `1px solid ${C.border}`,
    cursor: "pointer",
    userSelect: "none",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Registros (Logs)</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>— {total} movimientos</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Boton small variant="outline" onClick={exportarCSV}>Exportar CSV</Boton>
          <Boton small variant="outline" onClick={exportarPDF}>Exportar PDF</Boton>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPagina(1); }}
          placeholder="Buscar por acción…"
          style={{ maxWidth: 260 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: C.sub }}>Desde</label>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPagina(1); }} style={{ maxWidth: 160 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: C.sub }}>Hasta</label>
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPagina(1); }} style={{ maxWidth: 160 }} />
        </div>
        {(desde || hasta) && (
          <Boton small variant="ghost" onClick={() => { setDesde(""); setHasta(""); setPagina(1); }}>
            Limpiar
          </Boton>
        )}
      </div>

      <Tarjeta style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: C.surface }}>
                <th style={headerStyle}>#</th>
                <th style={headerStyle}>Tipo</th>
                <th style={headerStyle} onClick={() => alternarOrden("usuario")}>Usuario{flecha("usuario")}</th>
                <th style={headerStyle} onClick={() => alternarOrden("accion")}>Acción{flecha("accion")}</th>
                <th style={headerStyle} onClick={() => alternarOrden("fecha")}>Fecha{flecha("fecha")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? logs.map(l => (
                <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "11px 16px", color: C.muted }}>{l.id}</td>
                  <td style={{ padding: "11px 16px" }}><Etiqueta label={l.tipo} color={typeColor[l.tipo] || "blue"} /></td>
                  <td style={{ padding: "11px 16px", fontWeight: 600 }}>{l.usuario}</td>
                  <td style={{ padding: "11px 16px", color: C.sub }}>{l.accion}</td>
                  <td style={{ padding: "11px 16px", color: C.sub, fontSize: 12 }}>{l.fecha}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: C.sub }}>No hay registros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <span style={{ fontSize: 13, color: C.sub }}>
          Página {pagina} de {totalPaginas} ({total} registros)
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Boton small variant="ghost" disabled={pagina <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>
            Anterior
          </Boton>
          <Boton small variant="ghost" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>
            Siguiente
          </Boton>
        </div>
      </div>
    </div>
  );
}
