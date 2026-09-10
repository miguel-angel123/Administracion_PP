export function limpiarTexto(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  return v.replace(/[<>]/g, "").slice(0, max).trim();
}

export function limpiarDocumento(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").slice(0, 12);
}

export function limpiarPlaca(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function limpiarTelefono(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").slice(0, 10);
}
