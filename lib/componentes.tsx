import { C } from "./tema";

export function Etiqueta({ label, color }: { label: string; color: string }) {
  const bgColor = color === "green" ? "#10B98122" : color === "red" ? "#EF444422" : color === "gold" ? "#F59E0B22" : "#3B82F622";
  const txtColor = color === "green" ? C.green : color === "red" ? C.red : color === "gold" ? C.gold : C.accent;
  const brdColor = color === "green" ? "#10B98144" : color === "red" ? "#EF444444" : color === "gold" ? "#F59E0B44" : "#3B82F644";

  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600,
      background: bgColor, color: txtColor, border: `1px solid ${brdColor}`,
    }}>{label}</span>
  );
}

export function Boton({
  children, onClick, variant = "primary", small, danger, disabled, style: s
}: {
  children: React.ReactNode; onClick?: () => void; variant?: string; small?: boolean;
  danger?: boolean; disabled?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? "6px 14px" : "10px 20px",
      borderRadius: 8, fontWeight: 600, fontSize: small ? 13 : 14, cursor: "pointer",
      background: danger ? C.red : variant === "ghost" ? "transparent" : variant === "outline" ? "transparent" : `linear-gradient(135deg,${C.accent},${C.accent2})`,
      color: danger || variant === "primary" ? "#fff" : variant === "ghost" ? C.sub : C.accent,
      border: variant === "outline" ? `1px solid ${C.accent}` : variant === "ghost" ? `1px solid ${C.border}` : "none",
      opacity: disabled ? 0.5 : 1,
      ...s,
    }}>{children}</button>
  );
}

export function Tarjeta({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", ...s }}>
      {children}
    </div>
  );
}

export function Estrellas({ n, onChange }: { n: number; onChange?: (i: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} onClick={() => onChange?.(i)}
          style={{ fontSize: 22, cursor: onChange ? "pointer" : "default", color: i <= n ? C.gold : C.border }}>★</span>
      ))}
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 18 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.sub, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: "20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

export function FilaFormulario({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: C.sub, marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>{label}</label>
      {children}
    </div>
  );
}

export function TarjetaEstadistica({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) {
  return (
    <Tarjeta style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{
        width: 50, height: 50, borderRadius: 14, background: `${color}22`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
      }}>{icon}</div>
      <div>
        <p style={{ color: C.sub, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>{label}</p>
        <p style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 28, color }}>{value}</p>
      </div>
    </Tarjeta>
  );
}
