"use client";

import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { C } from "@/lib/tema";

const base = {
  background: C.card,
  color: C.text,
  confirmButtonColor: C.accent,
  cancelButtonColor: C.muted,
  customClass: { popup: "swal-popup" },
};

export function alertaError(mensaje: string, titulo = "Error") {
  return Swal.fire({ ...base, icon: "error", title: titulo, text: mensaje });
}

export function alertaExito(mensaje: string, titulo = "Listo") {
  return Swal.fire({ ...base, icon: "success", title: titulo, text: mensaje });
}

export function alertaAdvertencia(mensaje: string, titulo = "Atención") {
  return Swal.fire({ ...base, icon: "warning", title: titulo, text: mensaje });
}

export async function confirmar(
  mensaje: string,
  titulo = "¿Estás seguro?",
  textoBoton = "Sí, continuar"
): Promise<boolean> {
  const r = await Swal.fire({
    ...base,
    icon: "question",
    title: titulo,
    text: mensaje,
    showCancelButton: true,
    confirmButtonText: textoBoton,
    cancelButtonText: "Cancelar",
  });
  return r.isConfirmed;
}
