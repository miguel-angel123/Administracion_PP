export async function fetchSeguro(url: string, opciones: RequestInit = {}) {
  const metodo = (opciones.method || "GET").toUpperCase();
  const esMutante = ["POST", "PATCH", "PUT", "DELETE"].includes(metodo);

  if (!esMutante) return fetch(url, opciones);

  const csrf = document.cookie
    .split("; ")
    .find(c => c.startsWith("csrf="))
    ?.split("=")[1] || "";

  return fetch(url, {
    ...opciones,
    headers: {
      ...(opciones.headers || {}),
      "x-csrf-token": csrf,
    },
  });
}
