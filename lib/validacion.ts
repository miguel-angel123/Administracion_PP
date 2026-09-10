export const esPlacaValida = (v: string) =>
  /^[A-Z]{3}\d{3}$/.test(String(v || "").toUpperCase().trim());

export const esDocumentoValido = (v: string) =>
  /^\d{6,12}$/.test(String(v || "").trim());

export const esTelefonoValido = (v: string) =>
  /^\d{10}$/.test(String(v || "").trim());

export const esCorreoValido = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

export const sinAngular = (v: string) => !/[<>]/.test(String(v || ""));

export const esEnteroPositivo = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0;
};
