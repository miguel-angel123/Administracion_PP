// Paleta de colores centralizada. Un solo punto de verdad para mantener consistencia visual.
// Se exporta como "as const" para que TypeScript infiera los literales exactos
// y se eviten errores al pasar colores por props.
export const C = {
  bg:       "#0A0E1A", // Fondo general oscuro
  surface:  "#111827", // Superficies elevadas (barra lateral)
  card:     "#1A2236", // Fondo de tarjetas y modales
  border:   "#243049", // Bordes sutiles
  accent:   "#3B82F6", // Azul primario (acciones)
  accent2:  "#6366F1", // Índigo secundario (gradientes)
  gold:     "#F59E0B", // Ámbar para valores/precios
  green:    "#10B981", // Éxito/activo
  red:      "#EF4444", // Error/inactivo
  muted:    "#4B5563", // Texto muy tenue (IDs)
  text:     "#E2E8F0", // Texto principal
  sub:      "#94A3B8", // Texto secundario
} as const;
