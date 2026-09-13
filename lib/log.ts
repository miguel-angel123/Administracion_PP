// Re-export del modelo de logs.
// Se expone aquí para que los controladores importen siempre desde "@/lib/log",
// y así cambiarlo de ubicación en el futuro no rompa imports.
export { registrarLog } from "@/lib/models/log.model";

// Acciones auditables. Constantes para que el texto exacto del log y el CASE
// de clasificación en registros.model no se desincronicen por un typo.
export const LOG = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
} as const;
