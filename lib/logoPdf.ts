"use client";
// Logo único compartido por todos los PDF (contrato y reportes). El PNG
// (removebg, canal alfa) se pinta en <canvas> y se reexporta a dataURL PNG
// RGBA-8 estándar: sin esto ciertos PNG con alfa entran a addImage y fallan
// en silencio.
import jsPDF from "jspdf";
import logoMarca from "./public/Captura_desde_2026-09-18_22-20-28_LE_upscale_prime-removebg-preview.png";

export type LogoPDF = { src: string; ratio: number };

const MAX_ANCHO_FUENTE = 240;

async function normalizar(src: string): Promise<LogoPDF | null> {
  if (typeof document === "undefined") return null;
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  if (!img.naturalWidth || !img.naturalHeight) return null;

  const escala = Math.min(1, MAX_ANCHO_FUENTE / img.naturalWidth);
  const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
  const alto = Math.max(1, Math.round(img.naturalHeight * escala));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, ancho, alto);

  return { src: canvas.toDataURL("image/png"), ratio: ancho / alto };
}

let promesa: Promise<LogoPDF | null> | null = null;
let resuelto: LogoPDF | null = null;

export function cargarLogoPDF(): Promise<LogoPDF | null> {
  if (!promesa) {
    promesa = normalizar(logoMarca.src).then(l => {
      resuelto = l;
      return l;
    });
  }
  return promesa;
}

// Lectura sincrónica para constructores de Blob (no pueden await).
export function logoPDFSincrono(): LogoPDF | null {
  return resuelto;
}

// Estampa el logo en (x,y) dentro del recuadro máximo, respetando ratio.
// Devuelve dimensiones realmente dibujadas o null si no hay logo / falla.
export function estamparLogoPDF(
  doc: jsPDF,
  logo: LogoPDF | null,
  x: number,
  y: number,
  maxAncho: number,
  maxAlto: number
): { w: number; h: number } | null {
  if (!logo) return null;
  let w = maxAncho;
  let h = w / logo.ratio;
  if (h > maxAlto) {
    h = maxAlto;
    w = h * logo.ratio;
  }
  try {
    doc.addImage(logo.src, "PNG", x, y, w, h, undefined, "FAST");
  } catch {
    return null;
  }
  return { w, h };
}

if (typeof window !== "undefined") void cargarLogoPDF();
