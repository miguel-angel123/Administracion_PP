// Reglas de formato del proyecto. Se usan desde dos capas:
//   - Predicados puros (`esX`), consumidos por el frontend.
//   - Validadores que lanzan `ErrorDominio` (`exigirX`), consumidos por los
//     modelos del backend.
// Ambas variantes comparten la misma regla: `exigirX` llama a `esX`. Un cambio
// en el patrón se refleja en las dos capas sin tocar a los llamadores.
import { ErrorDominio } from "@/lib/models/errores";

// ------------------------- Reglas puras (frontend) -------------------------

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

// ------------------ Equivalentes con throw (backend) -----------------------
//
// Un caller directo (script, futura server action) no pasa por los formularios
// del navegador, así que los modelos tienen que aplicar la misma regla contra
// la entrada cruda. Estas variantes reutilizan los predicados de arriba.

export function exigirPlaca(v: string, campo = "La placa") {
  if (!esPlacaValida(v)) {
    throw new ErrorDominio(`${campo} debe tener 3 letras y 3 números (ej. ABC123)`, 400);
  }
}

export function exigirDocumento(v: string | number, campo = "El documento") {
  if (!esDocumentoValido(String(v ?? ""))) {
    throw new ErrorDominio(`${campo} debe tener entre 6 y 12 dígitos`, 400);
  }
}

export function exigirTelefono(v: string, campo = "El teléfono") {
  if (!esTelefonoValido(v)) {
    throw new ErrorDominio(`${campo} debe tener 10 dígitos`, 400);
  }
}

export function exigirCorreo(v: string, campo = "El correo") {
  if (!esCorreoValido(v)) {
    throw new ErrorDominio(`${campo} no es válido`, 400);
  }
}

export function exigirTextoObligatorio(v: string | undefined, campo: string, max = 100) {
  const limpio = String(v ?? "").trim();
  if (!limpio) throw new ErrorDominio(`${campo} es obligatorio`, 400);
  if (!sinAngular(limpio)) {
    throw new ErrorDominio(`${campo} contiene caracteres no permitidos`, 400);
  }
  if (limpio.length > max) {
    throw new ErrorDominio(`${campo} supera ${max} caracteres`, 400);
  }
  return limpio;
}
