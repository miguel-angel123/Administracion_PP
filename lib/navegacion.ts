// Navegación con Enter sobre inputs y selects.
// - Se activa una vez por sesión desde el cliente.
// - Cada campo debe estar dentro de un contenedor con [data-form-nav].
// - El botón de envío debe llevar [data-nav-submit].
// - Shift+Enter, Alt+Enter, Ctrl+Enter y Meta+Enter se respetan (no interfieren).
// - En textareas se permite salto de línea con Shift+Enter.
export function activarNavegacionEnter() {
  if (typeof document === "undefined") return;

  const marca = "__enterNavActivo";
  if ((document as any)[marca]) return;
  (document as any)[marca] = true;

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter") return;
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;

      const t = e.target as HTMLElement;
      const esCampo = t instanceof HTMLInputElement || t instanceof HTMLSelectElement;
      if (!esCampo) return;

      // Ignoramos checkboxes, radios, files y submits: no son navegables.
      if (
        t instanceof HTMLInputElement &&
        ["checkbox", "radio", "file", "submit", "button", "hidden"].includes(t.type)
      ) {
        return;
      }

      const contenedor = t.closest("[data-form-nav]");
      if (!contenedor) return;

      e.preventDefault();

      // Lista de campos navegables en orden DOM.
      const campos = Array.from(
        contenedor.querySelectorAll<HTMLElement>("input, select, textarea")
      ).filter((el) => {
        if (el.hasAttribute("disabled")) return false;
        if (el.getAttribute("data-nav") === "off") return false;
        if (el instanceof HTMLInputElement &&
            ["hidden", "checkbox", "radio", "file", "submit", "button"].includes(el.type)) return false;
        return true;
      });

      const i = campos.indexOf(t);
      const siguiente = campos[i + 1];

      if (siguiente) {
        // Mueve el foco al siguiente campo y selecciona su contenido (si es texto).
        siguiente.focus();
        if (siguiente instanceof HTMLInputElement &&
            ["text", "number", "tel", "email", "password", "search", "date"].includes(siguiente.type)) {
          siguiente.select();
        } else if (siguiente instanceof HTMLTextAreaElement) {
          siguiente.select();
        }
      } else {
        // Sin más campos: dispara el botón de envío marcado en el contenedor.
        const boton = contenedor.querySelector<HTMLButtonElement>("[data-nav-submit]");
        boton?.click();
      }
    },
    true,
  );
}
