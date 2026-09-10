// Re-export del modelo de logs.
// Se expone aquí para que los controladores importen siempre desde "@/lib/log",
// y así cambiarlo de ubicación en el futuro no rompa imports.
export { registrarLog } from "@/lib/models/log.model";
