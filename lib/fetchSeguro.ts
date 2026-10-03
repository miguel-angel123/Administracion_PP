// Funcion cliente para hacer fetch agregando CSRF cuando la peticion modifica datos.
export async function fetchSeguro(url: string, opciones: RequestInit = {}) {
  // Obtiene el metodo HTTP; si no existe, asume GET.
  const metodo = (opciones.method || "GET").toUpperCase();
  // Determina si el metodo puede modificar informacion del servidor.
  const esMutante = ["POST", "PATCH", "PUT", "DELETE"].includes(metodo);

  // Las peticiones GET no necesitan token CSRF.
  if (!esMutante) return fetch(url, opciones);

  // Lee la cookie csrf desde document.cookie.
  const csrf = document.cookie
    // Separa todas las cookies por "; ".
    .split("; ")
    // Busca la cookie cuyo nombre empieza por csrf=.
    .find(c => c.startsWith("csrf="))
    // Extrae solo el valor despues del signo igual.
    ?.split("=")[1] || "";

  // Ejecuta fetch incluyendo las opciones originales y el header CSRF.
  return fetch(url, {
    // Conserva method, body, credentials u otras opciones recibidas.
    ...opciones,
    // Fusiona headers previos con el header x-csrf-token.
    headers: {
      ...(opciones.headers || {}),
      // Header que middleware.ts compara contra la cookie csrf.
      "x-csrf-token": csrf,
    },
  });
}
