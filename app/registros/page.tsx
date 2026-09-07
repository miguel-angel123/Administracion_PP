"use client";

import { C } from "@/lib/tema";
import { Tarjeta, Etiqueta } from "@/lib/componentes";

export default function RegistrosPage() {
  const logs = [
    { id: 1, tipo: "LOGIN",    usuario: "Isaac Aray",         accion: "Inicio de sesión",           fecha: "2025-05-10 08:01" },
    { id: 2, tipo: "CREATE",   usuario: "Isaac Aray",         accion: "Registró vehículo GHI321",   fecha: "2025-05-10 09:32" },
    { id: 3, tipo: "EDIT",     usuario: "Miguel A. Colobón",  accion: "Modificó vehículo ABC123",   fecha: "2025-05-10 10:15" },
    { id: 4, tipo: "LOGIN",    usuario: "Miguel A. Godoy",    accion: "Inicio de sesión",           fecha: "2025-05-10 11:00" },
    { id: 5, tipo: "INACTIVE", usuario: "Miguel A. Colobón",  accion: "Inactivó vehículo DEF456",   fecha: "2025-05-10 11:30" },
    { id: 6, tipo: "CREATE",   usuario: "Carlos Pérez",       accion: "Envió sugerencia",           fecha: "2025-05-10 12:00" },
  ];
  const typeColor: Record<string, string> = { LOGIN: "blue", CREATE: "green", EDIT: "gold", INACTIVE: "red" };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Módulo Registros (Logs)</h2>
        <p style={{ color: C.sub, fontSize: 14 }}>RF 2.7 — movimientos del sistema</p>
      </div>
      <Tarjeta style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: C.surface }}>
              {["#", "Tipo", "Usuario", "Acción", "Fecha"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: C.sub, fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: .5, borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "11px 16px", color: C.muted }}>{l.id}</td>
                <td style={{ padding: "11px 16px" }}><Etiqueta label={l.tipo} color={typeColor[l.tipo]} /></td>
                <td style={{ padding: "11px 16px", fontWeight: 600 }}>{l.usuario}</td>
                <td style={{ padding: "11px 16px", color: C.sub }}>{l.accion}</td>
                <td style={{ padding: "11px 16px", color: C.sub, fontSize: 12 }}>{l.fecha}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>
    </div>
  );
}
