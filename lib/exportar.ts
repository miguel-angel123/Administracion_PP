// Exportación de reportes. Dos formatos:
//   - CSV: archivo plano RFC 4180. Con BOM UTF-8 para que Excel (Windows)
//     respete tildes y ñ en vez de interpretar como Windows-1252.
//   - PDF: documento maquetado con encabezado, tabla y numeración de páginas.
//
// jspdf y jspdf-autotable se cargan con `await import(...)` dentro del
// handler: el bundle del navegador no los incluye en el árbol inicial,
// solo cuando el operador dispara la exportación.

// Escapa un valor para CSV. RFC 4180: si contiene coma, comilla, salto de
// línea o el delimitador, se envuelve en comillas y las comillas internas
// se duplican.
function celdaCSV(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Serializa una matriz de filas (objetos) a un CSV con encabezado. El orden
// de columnas lo fija el llamador: `columnas` es la lista de claves.
// Se usa \r\n (CRLF) para máxima compatibilidad con Excel.
export function filasACSV(columnas: string[], filas: Record<string, unknown>[]): string {
  const head = columnas.map(celdaCSV).join(",");
  const body = filas
    .map(f => columnas.map(c => celdaCSV(f[c])).join(","))
    .join("\r\n");
  return `${head}\r\n${body}`;
}

// Descarga un blob como archivo mediante un <a download> efímero.
// Libera la URL después del click: si no, el blob queda en memoria del
// navegador hasta cerrar la pestaña.
export function descargarBlob(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Descarga CSV. Se antepone U+FEFF (BOM UTF-8) al contenido: sin él, Excel
// abre el archivo en la codificación del sistema y rompe tildes/ñ.
export function descargarCSV(nombre: string, contenido: string) {
  const blob = new Blob(["\uFEFF" + contenido], { type: "text/csv;charset=utf-8;" });
  descargarBlob(nombre, blob);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export interface ColumnaPDF {
  encabezado: string;
  ancho: number;                          // en puntos tipográficos
  alinear?: "left" | "center" | "right";
}

export interface ReportePDF {
  titulo: string;
  subtitulo?: string;
  columnas: ColumnaPDF[];
  filas: (string | number)[][];
  nombreArchivo: string;
}

export async function exportarReportePDF(r: ReportePDF) {
  // Carga diferida: dos paquetes grandes que solo se necesitan al hacer clic.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const ANCHO_PAGINA = doc.internal.pageSize.getWidth();

  // --- Encabezado ---
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(r.titulo, 40, 50);

  if (r.subtitulo) {
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(r.subtitulo, 40, 68);
  }

  doc.setDrawColor(210);
  doc.line(40, 78, ANCHO_PAGINA - 40, 78);

  // --- Tabla ---
  autoTable(doc, {
    startY: 92,
    head: [r.columnas.map(c => c.encabezado)],
    body: r.filas,
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: Object.fromEntries(
      r.columnas.map((c, i) => [i, { cellWidth: c.ancho, halign: c.alinear || "left" }])
    ),
    margin: { left: 40, right: 40, bottom: 60 },
  });

  // --- Numeración de páginas ---
  // Se añade después de dibujar la tabla: en ese momento doc.getNumberOfPages()
  // ya conoce el total real. autoTable no expone ese dato dentro de sus
  // callbacks, por eso el loop posterior.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Parqueadero La Pradera", 40, 815);
    doc.text(`Página ${i} de ${total}`, ANCHO_PAGINA - 40, 815, { align: "right" });
  }

  doc.save(`${r.nombreArchivo}.pdf`);
}
