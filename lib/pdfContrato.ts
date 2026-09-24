// Genera el contrato mensual en PDF desde el cliente. jsPDF y jspdf-autotable
// ya son dependencias del proyecto; el documento se arma en memoria y se
// entrega como Blob para poder descargarlo o compartirlo sin pasar por el backend.
"use client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cargarLogoPDF, logoPDFSincrono, estamparLogoPDF, type LogoPDF } from "./logoPdf";

// Claves de campos opcionales. El llamador pasa un mapa { campo: boolean }:
// un campo marcado false se omite del PDF por completo, no sólo se deja vacío.
export type CampoContrato =
  | "telefono" | "correo" | "clase" | "color" | "puesto"
  | "ingreso" | "precio" | "dia_pago" | "pagado";

export type DatosContratoPDF = {
  placa: string;
  nombre: string;
  doc: string;
  telefono?: string | null;
  correo?: string | null;
  color?: string | null;
  clase?: string | null;
  puesto?: string | null;
  ingreso?: string | null;
  precio?: number | null;
  dia_pago?: number | null;
  pagado?: boolean | null;
  firmaGerente?: string | null;
  // Logo del parqueadero ya horneado a dataURL. El ratio (ancho/alto) viaja
  // aparte porque jsPDF no expone dimensiones del dataURL que recibe.
  // `undefined` = usar el logo precargado; `null` = contrato sin logo.
  logo?: LogoPDF | null;
};

export interface OpcionesContratoPDF {
  incluir?: Partial<Record<CampoContrato, boolean>>;
}

const AZUL: [number, number, number] = [59, 130, 246];
// Alto reservado sobre cada línea de firma para estampar la imagen.
const ALTO_FIRMA = 20;
// Ancho de la imagen de firma, centrada sobre su línea.
const ANCHO_FIRMA = 52;

function texto(v: string | null | undefined) {
  return v && String(v).trim() ? String(v) : "—";
}

function dinero(v: number | null | undefined) {
  return v != null ? `$${Number(v).toLocaleString("es-CO")}` : "—";
}

function nombreArchivo(d: DatosContratoPDF) {
  return `contrato-${d.placa}.pdf`;
}

// Última Y usada por autoTable. El tipado de jspdf-autotable no la expone en
// la instancia de jsPDF, así que se lee con una aserción acotada.
function ultimaY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function formatoImagen(dataUrl: string): "PNG" | "JPEG" {
  return /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
}

function estamparFirma(doc: jsPDF, imagen: string, x: number, yLinea: number) {
  try {
    doc.addImage(
      imagen,
      formatoImagen(imagen),
      x,
      yLinea - ALTO_FIRMA - 2,
      ANCHO_FIRMA,
      ALTO_FIRMA,
      undefined,
      "FAST"
    );
  } catch {
    // Una imagen ilegible no debe impedir que el contrato se descargue.
  }
}

// Arma el contrato completo y lo devuelve como Blob. Es la base de la descarga
// y del compartir: el documento se genera una sola vez por llamada.
export function construirContratoPDFBlob(
  d: DatosContratoPDF,
  opts: OpcionesContratoPDF = {}
): Blob {
  const inc = opts.incluir ?? {};
  const doc = new jsPDF();

  // d.logo === undefined → usa el logo precargado. null explícito → sin logo.
  const logo = d.logo === undefined ? logoPDFSincrono() : d.logo;
  estamparLogoPDF(doc, logo, 14, 10, 60, 30);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("LA PRADERA — PARQUEADERO", 105, 20, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Contrato de parqueo mensual", 105, 27, { align: "center" });
  doc.line(14, 31, 196, 31);

  // Datos de identificación: siempre viajan.
  const filas: [string, string][] = [
    ["Placa", texto(d.placa)],
    ["Propietario", texto(d.nombre)],
    ["Documento", texto(d.doc)],
  ];

  // Campos opcionales: sólo se agregan si el checkbox está activo. Un campo
  // desmarcado no aparece ni como "—".
  if (inc.telefono !== false) filas.push(["Teléfono", texto(d.telefono)]);
  if (inc.correo !== false) filas.push(["Correo", texto(d.correo)]);
  if (inc.clase !== false) filas.push(["Clase de vehículo", texto(d.clase)]);
  if (inc.color !== false) filas.push(["Color", texto(d.color)]);
  if (inc.puesto !== false) filas.push(["Puesto asignado", texto(d.puesto)]);
  if (inc.ingreso !== false) filas.push(["Inicio del contrato", texto(d.ingreso)]);

  autoTable(doc, {
    startY: 38,
    theme: "grid",
    headStyles: { fillColor: AZUL },
    head: [["Dato", "Valor"]],
    body: filas,
  });

  const filasEco: [string, string][] = [];
  if (inc.precio !== false) filasEco.push(["Precio mensual", dinero(d.precio)]);
  if (inc.dia_pago !== false) {
    filasEco.push(["Día de pago", d.dia_pago != null ? `Día ${d.dia_pago}` : "—"]);
  }
  if (inc.pagado !== false) {
    filasEco.push([
      "Estado del pago",
      d.pagado != null ? (d.pagado ? "Pagado" : "Pendiente") : "—",
    ]);
  }

  if (filasEco.length) {
    autoTable(doc, {
      startY: ultimaY(doc) + 8,
      theme: "grid",
      headStyles: { fillColor: AZUL },
      head: [["Concepto", "Valor"]],
      body: filasEco,
    });
  }

  // Con firma se necesita más aire entre la tabla y la línea, para que la
  // imagen no se monte sobre la última fila.
  const conFirma = Boolean(d.firmaGerente);
  const yLinea = ultimaY(doc) + (conFirma ? ALTO_FIRMA + 16 : 26);

  // Firma del parqueadero sobre su propia línea.
  if (d.firmaGerente) estamparFirma(doc, d.firmaGerente, 124, yLinea);

  doc.setFontSize(10);
  doc.line(20, yLinea, 80, yLinea);
  doc.text("Firma del cliente", 50, yLinea + 5, { align: "center" });
  doc.line(120, yLinea, 180, yLinea);
  doc.text("Firma del parqueadero", 150, yLinea + 5, { align: "center" });

  return doc.output("blob");
}

// Descarga directa. Se usa como respaldo cuando el navegador no sabe compartir.
export async function descargarContratoPDF(
  d: DatosContratoPDF,
  opts: OpcionesContratoPDF = {}
): Promise<void> {
  // Si el llamador no fijó logo (undefined), esperamos el precargado. Un valor
  // explícito —incluido null— se respeta tal cual.
  const logo = d.logo === undefined ? await cargarLogoPDF() : d.logo;
  const url = URL.createObjectURL(construirContratoPDFBlob({ ...d, logo }, opts));
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = nombreArchivo(d);
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  // El objectURL se libera con retraso a propósito: revocarlo en el mismo tick
  // cancela la descarga en algunos builds de Chrome.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Comparte el PDF por la hoja nativa del sistema (WhatsApp, correo, etc.).
// Si el navegador no soporta compartir archivos, cae a descarga y lo reporta
// con el valor devuelto para que la UI avise al usuario.
export async function compartirContratoPDF(
  d: DatosContratoPDF,
  opts: OpcionesContratoPDF = {}
): Promise<"compartido" | "descargado"> {
  // Se resuelve el logo antes de construir el Blob: el `File` se crea una sola
  // vez y el fallback de descarga reusa el mismo valor ya resuelto.
  const logo = d.logo === undefined ? await cargarLogoPDF() : d.logo;
  const archivo = new File([construirContratoPDFBlob({ ...d, logo }, opts)], nombreArchivo(d), {
    type: "application/pdf",
  });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({
        files: [archivo],
        title: `Contrato ${d.placa}`,
        text: `Contrato de parqueo mensual — ${d.placa}`,
      });
      return "compartido";
    } catch (e) {
      // El usuario cerró la hoja de compartir: no es un fallo.
      if ((e as DOMException)?.name === "AbortError") return "compartido";
      throw e;
    }
  }

  // Al pasar `logo` explícito (aunque sea null) no se re-dispara la carga.
  await descargarContratoPDF({ ...d, logo }, opts);
  return "descargado";
}
