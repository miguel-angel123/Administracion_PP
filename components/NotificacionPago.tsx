"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useLiveData } from "@/lib/live/useLiveData";
import { fetchSeguro } from "@/lib/fetchSeguro";
import { alertaError } from "@/lib/alerta";
import { C } from "@/lib/tema";
import { Boton } from "@/lib/componentes";

export interface ContratoNotificacion {
  placa: string;
  propietario: string;
  doc: string;
  dia_pago: number;
  precio: number | null;
  tipo_nombre: string | null;
  tipo_icono: string | null;
}

interface Contexto {
  lista: ContratoNotificacion[];
  abierto: boolean;
  abrir: () => void;
  cerrar: () => void;
  pagar: (placa: string) => Promise<void>;
  puedePagar: boolean;
}

const Ctx = createContext<Contexto | null>(null);

export function useNotificacionPago() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotificacionPago fuera de NotificacionPagoProvider");
  return c;
}

export function NotificacionPagoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lista, setLista] = useState<ContratoNotificacion[]>([]);
  const [abierto, setAbierto] = useState(false);
  // Ref y no state: solo se compara contra la última cantidad sin re-render,
  // y sobrevive a los renders intermedios del polling.
  const cantidadPrevia = useRef(0);

  const visible = user?.role === "gerente" || user?.role === "empleado";
  const puedePagar = user?.role === "gerente";

  const cargar = useCallback(async () => {
    if (!visible) return;
    const res = await fetch("/api/vehiculos?recurso=notificaciones", { cache: "no-store" });
    if (!res.ok) return;
    const nuevos: ContratoNotificacion[] = await res.json();
    if (!Array.isArray(nuevos)) return;
    // Reabre solo si la lista crece: un pago propio o ajeno la encoge y el
    // modal cerrado no vuelve a saltar. Al montar, cantidadPrevia=0 garantiza
    // que la primera carga con ítems abra de una.
    if (nuevos.length > cantidadPrevia.current) setAbierto(true);
    cantidadPrevia.current = nuevos.length;
    setLista(nuevos);
  }, [visible]);

  useEffect(() => {
    if (visible) return;
    cantidadPrevia.current = 0;
    setLista([]);
    setAbierto(false);
  }, [visible]);

  useLiveData(cargar, 10_000);

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);

  const pagar = useCallback(async (placa: string) => {
    if (!puedePagar) return;
    // Reusa el PATCH existente: sella pagado_mes con el mes en curso y el
    // trigger de versión bumpea /api/version. Sin endpoint nuevo.
    const res = await fetchSeguro(`/api/vehiculos/${placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagado: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alertaError(data.error || "No se pudo marcar el pago");
      return;
    }
    setLista(prev => {
      const siguiente = prev.filter(c => c.placa !== placa);
      cantidadPrevia.current = siguiente.length;
      if (siguiente.length === 0) setAbierto(false);
      return siguiente;
    });
  }, [puedePagar]);

  return (
    <Ctx.Provider value={{ lista, abierto, abrir, cerrar, pagar, puedePagar }}>
      {children}
    </Ctx.Provider>
  );
}

export function ModalNotificacionPago() {
  const { lista, abierto, cerrar, pagar, puedePagar } = useNotificacionPago();
  if (!abierto || lista.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 560,
          background: C.card, borderRadius: 14,
          border: `1px solid ${C.border}`,
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
          position: "relative",
          display: "flex", flexDirection: "column",
          maxHeight: "80vh",
        }}
      >
        <button
          type="button"
          aria-label="Cerrar notificaciones"
          onClick={cerrar}
          style={{
            position: "absolute", top: 8, right: 12,
            background: "transparent", border: "none",
            color: C.sub, fontSize: 24, lineHeight: 1, cursor: "pointer",
          }}
        >
          ×
        </button>

        <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${C.border}` }}>
          <h3 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 18 }}>
            Pagos pendientes
          </h3>
          <p style={{ color: C.sub, fontSize: 13 }}>
            {lista.length} contrato{lista.length === 1 ? "" : "s"} con día de pago vencido
          </p>
        </div>

        <div style={{ padding: "10px 20px", overflowY: "auto" }}>
          {lista.map(c => (
            <div
              key={c.placa}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 0", borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span style={{ fontSize: 24 }}>{c.tipo_icono || "🚗"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 14 }}>
                  {c.placa}
                </p>
                <p
                  style={{
                    color: C.sub, fontSize: 12,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {c.propietario} · Día {c.dia_pago}
                  {c.precio != null && ` · $${Number(c.precio).toLocaleString("es-CO")}`}
                </p>
              </div>
              {puedePagar && (
                <Boton small onClick={() => pagar(c.placa)}>Pagado</Boton>
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: "12px 20px", borderTop: `1px solid ${C.border}`,
            display: "flex", justifyContent: "flex-end",
          }}
        >
          <Boton variant="ghost" onClick={cerrar}>Cancelar</Boton>
        </div>
      </div>
    </div>
  );
}
