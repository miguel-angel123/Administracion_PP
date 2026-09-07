"use client";

import { useState } from "react";
import { C } from "@/lib/tema";
import { Tarjeta, FilaFormulario, Boton, Estrellas, Etiqueta } from "@/lib/componentes";
import { useAuth } from "@/lib/auth";
import { SUGERENCIAS_INIT, type Sugerencia } from "@/lib/datos";

export default function SugerenciasPage() {
  const { user } = useAuth();
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>(SUGERENCIAS_INIT);
  const [form, setForm] = useState({ texto: "", reseña: 0 });
  const [filter, setFilter] = useState("todas");

  const visible = sugerencias.filter(s => filter === "todas" || s.estado === filter);

  const marcarLeida = (id: number) => setSugerencias(prev => prev.map(s => s.id === id ? { ...s, estado: "leída" } : s));

  const enviar = () => {
    if (!form.texto.trim()) return;
    setSugerencias(prev => [...prev, {
      id: Date.now(), usuario: user!.name,
      fecha: new Date().toISOString().slice(0, 10),
      texto: form.texto, reseña: form.reseña, estado: "pendiente",
    }]);
    setForm({ texto: "", reseña: 0 });
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Sugerencias</h2>
        <p style={{ color: C.sub, fontSize: 14 }}>RF 2.6 · RF 3.4</p>
      </div>

      {user?.role === "cliente" && (
        <Tarjeta style={{ marginBottom: 24 }}>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 14 }}>Enviar Sugerencia</h3>
          <FilaFormulario label="Tu sugerencia"><textarea value={form.texto} onChange={e => setForm({ ...form, texto: e.target.value })} rows={4} placeholder="Escribe aquí tu sugerencia…" /></FilaFormulario>
          <FilaFormulario label="Reseña"><Estrellas n={form.reseña} onChange={n => setForm({ ...form, reseña: n })} /></FilaFormulario>
          <Boton onClick={enviar}>Enviar Sugerencia</Boton>
        </Tarjeta>
      )}

      {user?.role !== "cliente" && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {["todas", "pendiente", "leída"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "7px 14px", borderRadius: 8,
              border: `1px solid ${filter === f ? C.accent : C.border}`,
              background: filter === f ? `${C.accent}22` : "transparent",
              color: filter === f ? C.accent : C.sub,
              fontWeight: 600, fontSize: 13, cursor: "pointer", textTransform: "capitalize",
            }}>{f}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visible.map(s => (
          <Tarjeta key={s.id}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{s.usuario}</span>
                <span style={{ color: C.sub, fontSize: 12, marginLeft: 10 }}>{s.fecha}</span>
              </div>
              <Etiqueta label={s.estado} color={s.estado === "pendiente" ? "gold" : "blue"} />
            </div>
            <p style={{ color: C.text, fontSize: 14, marginBottom: 8 }}>{s.texto}</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Estrellas n={s.reseña} />
              {user?.role !== "cliente" && s.estado === "pendiente" && <Boton small variant="outline" onClick={() => marcarLeida(s.id)}>Marcar como leída</Boton>}
            </div>
          </Tarjeta>
        ))}
        {visible.length === 0 && <p style={{ color: C.sub, textAlign: "center", padding: 30 }}>No hay sugerencias.</p>}
      </div>
    </div>
  );
}
