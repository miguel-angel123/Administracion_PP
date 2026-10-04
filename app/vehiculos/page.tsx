"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { C } from "@/lib/tema";
import { Boton, Tarjeta, Etiqueta, Modal, FilaFormulario } from "@/lib/componentes";
import { useAuth } from "@/lib/auth";
import { alertaError, alertaExito, alertaAdvertencia, confirmar } from "@/lib/alerta";
import { esPlacaValida, esDocumentoValido, esTelefonoValido, sinAngular } from "@/lib/validacion";
import { fetchSeguro } from "@/lib/fetchSeguro";
import { useLiveData } from "@/lib/live/useLiveData";
import {
  descargarContratoPDF,
  compartirContratoPDF,
  type DatosContratoPDF,
} from "@/lib/pdfContrato";

interface VehiculoDB {
  placa: string;
  doc?: string;
  telefono?: string;
  color?: string;
  nombre: string;
  tipo: string; // "mensual" o "diario"
  clase_vehiculo?: string; // nombre real del tipo: "Automóvil", "Moto", "Camión"…
  tipo_icono?: string;
  puesto?: string;
  correo?: string;
  ingreso?: string;
  puestoSeleccionado?: string;
  precio?: number | null;
  dia_pago?: number | null;
  pagado?: boolean;
}

interface VehiculoPuesto {
  placa: string;
  doc: string;
  nombre: string;
  telefono: string | null;
  color: string | null;
  tipo: string;            // "mensual" | "diario"
  tipo_nombre: string | null;
  tipo_icono: string | null;
  clase_vehiculo: string | null;
  ingreso: string;
  precio: number | null;
  dia_pago: number | null;
  pagado: boolean;
}

interface PuestoDB {
  id: string;
  numero_puesto: number;
  estado_puesto: boolean;
  vehiculoActual: VehiculoPuesto | null;
}

interface TipoVehiculo {
  id: string;
  nombre: string;
  icono: string;
}

// Clave de la firma del parqueadero. El prefijo evita colisiones con otras
// apps servidas desde el mismo dominio.
const CLAVE_FIRMA_GERENTE = "pradera:firmaGerente";
// Clave sin prefijo usada por versiones anteriores. Se migra al montar.
const CLAVE_FIRMA_LEGACY = "firmaGerente";

// Datos bancarios del parqueadero: persisten entre contratos para que el
// gerente no reescriba el número de cuenta cada vez. Viven en el navegador,
// igual que la firma.
const CLAVE_TIPO_PAGO = "pradera:tipoPago";
const CLAVE_NUMERO_CUENTA = "pradera:numeroCuenta";

// Tamaño máximo de la firma normalizada. El canvas reduce fotos de celular
// (varios MB) a algo que quepa holgado en localStorage.
const ANCHO_FIRMA = 600;
const ALTO_FIRMA = 240;

// Umbrales de long-press. 3 s entra en modo "mover de puesto"; 6 s abre el
// menú de pago. Ambos corren en paralelo: si el dedo aguanta hasta 6 s, el
// modo "mover" se cancela y escala al menú, evitando dos modos activos a la
// vez. 3 s evita que un roce durante el scroll dispare el modo por accidente.
const MS_LONG_PRESS_MOVER = 500;
const MS_LONG_PRESS_PAGO = 1000;

type CampoContrato = {
  clave: keyof DatosContratoPDF;
  etiqueta: string;
  // Campo serializado a texto: sirve para copiarlo tal cual al PDF.
  valor: (d: DatosContratoPDF) => string;
  // Vuelve a escribir el campo desde el texto editado en el modal.
  escribir: (d: DatosContratoPDF, v: string) => DatosContratoPDF;
  // Si viene, el modal pinta un <select> en vez de un <input>. El PDF sigue
  // leyendo `valor` como string, así un contrato con un valor fuera de la
  // lista no se rompe.
  opciones?: readonly string[];
};

// Campos opcionales del contrato. Cada uno se puede incluir o excluir antes de
// generar el PDF: el cliente no siempre quiere que viaje su correo o su precio.
const CAMPOS_CONTRATO: CampoContrato[] = [
  { clave: "telefono", etiqueta: "Teléfono", valor: d => d.telefono ?? "", escribir: (d, v) => ({ ...d, telefono: v }) },
  { clave: "correo", etiqueta: "Correo", valor: d => d.correo ?? "", escribir: (d, v) => ({ ...d, correo: v }) },
  { clave: "clase", etiqueta: "Clase de vehículo", valor: d => d.clase ?? "", escribir: (d, v) => ({ ...d, clase: v }) },
  { clave: "color", etiqueta: "Color", valor: d => d.color ?? "", escribir: (d, v) => ({ ...d, color: v }) },
  { clave: "puesto", etiqueta: "Puesto asignado", valor: d => d.puesto ?? "", escribir: (d, v) => ({ ...d, puesto: v }) },
  { clave: "ingreso", etiqueta: "Inicio del contrato", valor: d => d.ingreso ?? "", escribir: (d, v) => ({ ...d, ingreso: v }) },
  { clave: "precio", etiqueta: "Precio mensual", valor: d => (d.precio != null ? String(d.precio) : ""), escribir: (d, v) => ({ ...d, precio: v === "" ? null : Number(v) }) },
  { clave: "dia_pago", etiqueta: "Día de pago", valor: d => (d.dia_pago != null ? String(d.dia_pago) : ""), escribir: (d, v) => ({ ...d, dia_pago: v === "" ? null : Number(v) }) },
  { clave: "pagado", etiqueta: "Estado del pago", valor: d => String(!!d.pagado), escribir: (d, v) => ({ ...d, pagado: v === "true" }) },
  {
    clave: "tipo_pago",
    etiqueta: "Tipo de pago",
    valor: d => d.tipo_pago ?? "",
    escribir: (d, v) => ({ ...d, tipo_pago: v }),
    opciones: ["Efectivo", "Nequi", "Daviplata", "Banco Caja Social"],
  },
  {
    clave: "numero_cuenta",
    etiqueta: "N° cuenta destino",
    valor: d => d.numero_cuenta ?? "",
    escribir: (d, v) => ({ ...d, numero_cuenta: v }),
  },
];

const INCLUIR_DEFAULT: Record<string, boolean> = Object.fromEntries(
  CAMPOS_CONTRATO.map(c => [c.clave, true])
);

// Valor legible para la tabla del modal. Los campos con formato propio
// (dinero, día, booleano) se resuelven aquí para no repetir el CASE en el JSX.
function mostrarCampo(campo: CampoContrato, d: DatosContratoPDF): string {
  const crudo = campo.valor(d);
  if (!crudo.trim()) return "—";
  if (campo.clave === "precio") return `$${Number(crudo).toLocaleString("es-CO")}`;
  if (campo.clave === "dia_pago") return `Día ${crudo}`;
  if (campo.clave === "pagado") return crudo === "true" ? "Pagado" : "Pendiente";
  return crudo;
}

// Reduce y reencodea la imagen elegida por el usuario. El PNG resultante tiene
// fondo transparente, así que la firma se apoya limpia sobre la línea del PDF.
async function normalizarFirma(archivo: File): Promise<string> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, ANCHO_FIRMA / bitmap.width, ALTO_FIRMA / bitmap.height);
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no expone contexto 2D");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  return canvas.toDataURL("image/png");
}

type ContratoState = {
  datos: DatosContratoPDF;
  incluir: Record<string, boolean>;
  editando: boolean;
  compartiendo: boolean;
};

export default function VehiculosPage() {
  const { user } = useAuth();

  // Estados de Datos
  const [puestos, setPuestos] = useState<PuestoDB[]>([]);
  const [inactivos, setInactivos] = useState<VehiculoDB[]>([]);
  const [tiposVeh, setTiposVeh] = useState<TipoVehiculo[]>([]);

  // Estados de Modales y Formularios
  const [modal, setModal] = useState<string | null>(null);
  const [selected, setSelected] = useState<VehiculoDB | null>(null);
  const [form, setForm] = useState<Partial<VehiculoDB>>({});
  const [papeleraAbierta, setPapeleraAbierta] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  // Mensajes de validación mostrados dentro del modal, sin popup externo.
  // En móvil la alerta centrada tapaba el campo que había que corregir.
  const [erroresForm, setErroresForm] = useState<string[]>([]);

  // Context menu sobre el chip: alterna el estado de pago.
  const [menu, setMenu] = useState<{
    placa: string;
    x: number;
    y: number;
    pagado: boolean;
  } | null>(null);

  // Ref al nodo del menú contextual para medirlo tras montarlo y desplazarlo
  // si cae contra el borde. `menuPos` guarda las coordenadas ya recortadas al
  // viewport; `menu.x/y` siguen siendo el punto crudo del toque.
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Firma del parqueadero: vive en el navegador del gerente y se estampa en
  // todos los contratos que genere.
  const [firmaGerente, setFirmaGerente] = useState<string | null>(null);
  const firmaInputRef = useRef<HTMLInputElement>(null);

  // Contrato en edición. Null = modal cerrado.
  const [contrato, setContrato] = useState<ContratoState | null>(null);

  // Vehículo inactivo en modo "colocar": un chip sigue al mouse y el próximo
  // clic sobre un puesto libre lo reactiva ahí. null = modo inactivo.
  const [colocando, setColocando] = useState<VehiculoDB | null>(null);
  // Vehículo activo en modo "mover": se abre con long-press sostenido y el
  // próximo clic sobre un puesto libre lo reasigna. Alternativa táctil al
  // drag&drop, que en móvil compite con el scroll.
  const [moviendo, setMoviendo] = useState<{ placa: string; pagado: boolean } | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [puestoHover, setPuestoHover] = useState<string | null>(null);

  // Detección de puntero grueso (dedo). Decide si el chip es `draggable` o si
  // se activa el long-press que abre el menú.
  const [esTactil, setEsTactil] = useState(false);
  // Timers de long-press. Uno para el modo mover (3 s), otro para el menú de
  // pago (6 s). Se limpian los dos al mismo tiempo en cualquier cancelación.
  const longPressMoverRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPagoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bandera que suprime el `click` sintetizado tras un long-press consumado.
  const longPressConsumido = useRef(false);

  // Tolerancia de deriva del dedo. Con `touch-action: none` ya no compite
  // con el scroll, así que el margen solo absorbe micro-temblores y una
  // pulsación humana normal cabe holgada.
  const UMBRAL_MOVIMIENTO = 24;
  // Punto donde ancló el toque para medir la deriva.
  const inicioToque = useRef<{ x: number; y: number } | null>(null);

  // Escala visual del mapa interactivo. Permite encajar parqueaderos con muchos
  // puestos dentro del viewport sin scroll vertical.
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 1.4;
  const ZOOM_PASO = 0.1;

  const zoomOut = () => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_PASO).toFixed(2)));
  const zoomIn = () => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_PASO).toFixed(2)));
  const zoomReset = () => setZoom(1);

  // Permisos según rol
  const canCreate = user?.role === "gerente";
  const canEdit = user?.role === "gerente";
  const canInactivate = user?.role === "gerente";

  const loadPuestos = async () => {
    const res = await fetch("/api/vehiculos?recurso=puestos");
    const data = await res.json();
    if (Array.isArray(data)) setPuestos(data);
  };

  const loadInactivos = async () => {
    const res = await fetch("/api/vehiculos?recurso=papelera");
    const data = await res.json();
    if (Array.isArray(data)) setInactivos(data);
  };

  useLiveData(() => {
    loadPuestos();
  }, 8000);

  useEffect(() => {
    loadPuestos();
    if (canInactivate) loadInactivos();
    (async () => {
      const res = await fetch("/api/vehiculos?recurso=tipos");
      const data = await res.json();
      if (Array.isArray(data)) setTiposVeh(data);
    })();

    // `pointer: coarse` falla en Android con stylus/DeX/teclado activos.
    // `maxTouchPoints` y `ontouchstart` cubren esos casos: en cualquiera de
    // los tres, el chip debe desactivar `draggable` y el tooltip.
    setEsTactil(
      window.matchMedia("(pointer: coarse)").matches ||
      navigator.maxTouchPoints > 0 ||
      "ontouchstart" in window
    );

    // Recupera la firma guardada. Si solo existe la clave antigua, se mueve a
    // la nueva y se borra: así queda una única fuente a partir de aquí.
    try {
      const actual = localStorage.getItem(CLAVE_FIRMA_GERENTE);
      if (actual) {
        setFirmaGerente(actual);
      } else {
        const legacy = localStorage.getItem(CLAVE_FIRMA_LEGACY);
        if (legacy) {
          localStorage.setItem(CLAVE_FIRMA_GERENTE, legacy);
          localStorage.removeItem(CLAVE_FIRMA_LEGACY);
          setFirmaGerente(legacy);
        }
      }
    } catch {
      // Modo privado o almacenamiento bloqueado: se sigue sin firma persistida.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste los datos bancarios cada vez que cambian. localStorage es síncrono
  // y barato: no hace falta debounce. Si el usuario desmarca el checkbox, el
  // valor sigue en `datos`, así que también se preserva.
  useEffect(() => {
    if (!contrato) return;
    try {
      if (contrato.datos.tipo_pago) {
        localStorage.setItem(CLAVE_TIPO_PAGO, contrato.datos.tipo_pago);
      }
      if (contrato.datos.numero_cuenta) {
        localStorage.setItem(CLAVE_NUMERO_CUENTA, contrato.datos.numero_cuenta);
      }
    } catch {
      // Almacenamiento bloqueado: la sesión se pierde al cerrar el modal.
    }
  }, [contrato]);

  // Cierra el menú contextual cuando el usuario interactúa fuera de él.
  useEffect(() => {
    if (!menu) return;
    // Marca de apertura: el navegador sintetiza un click al levantar el dedo
    // tras un long-press (y otro antes si el gesture fue tomado por el
    // sistema). Sin esta ventana el menú se cierra solo apenas se abre.
    const abiertoEn = Date.now();
    const cerrar = () => {
      if (Date.now() - abiertoEn < 500) return;
      setMenu(null);
    };
    window.addEventListener("click", cerrar);
    window.addEventListener("touchstart", cerrar, { passive: true });
    window.addEventListener("scroll", cerrar, { passive: true });
    return () => {
      window.removeEventListener("click", cerrar);
      window.removeEventListener("touchstart", cerrar);
      window.removeEventListener("scroll", cerrar);
    };
  }, [menu]);

  // Posiciona el menú recortado al viewport. Corre antes del paint, así que el
  // primer frame que ve el usuario ya está en la ubicación final. Depende de
  // `menu` (identidad nueva en cada apertura): cada vez que se abre, se vuelve
  // a medir y recortar.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    const MARGEN = 8;
    const maxX = Math.max(MARGEN, window.innerWidth  - r.width  - MARGEN);
    const maxY = Math.max(MARGEN, window.innerHeight - r.height - MARGEN);
    setMenuPos({
      x: Math.min(Math.max(menu.x, MARGEN), maxX),
      y: Math.min(Math.max(menu.y, MARGEN), maxY),
    });
  }, [menu]);

  // Modo "colocar": el chip persigue al puntero y ESC aborta la operación.
  useEffect(() => {
    if (!colocando) return;
    const mover = (e: MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    const cancelar = (e: KeyboardEvent) => { if (e.key === "Escape") setColocando(null); };
    window.addEventListener("mousemove", mover);
    window.addEventListener("keydown", cancelar);
    return () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("keydown", cancelar);
    };
  }, [colocando]);

  // Modo "mover": ESC cancela. No hay chip flotante porque el vehículo ya está
  // pintado en su puesto actual.
  useEffect(() => {
    if (!moviendo) return;
    const cancelar = (e: KeyboardEvent) => { if (e.key === "Escape") setMoviendo(null); };
    window.addEventListener("keydown", cancelar);
    return () => window.removeEventListener("keydown", cancelar);
  }, [moviendo]);

  // Al desmontar, no dejar un timeout colgando.
  useEffect(() => () => {
    if (longPressMoverRef.current) clearTimeout(longPressMoverRef.current);
    if (longPressPagoRef.current) clearTimeout(longPressPagoRef.current);
  }, []);

  const puestosLibres = puestos.filter(p =>
    !p.estado_puesto || String(p.numero_puesto) === String(form.puesto)
  );

  const openCreate = () => {
    setForm({
      placa: "", nombre: "", doc: "", telefono: "", color: "",
      tipo: "mensual", clase_vehiculo: "", puestoSeleccionado: "",
      precio: null, dia_pago: null, pagado: false,
    });
    setErroresForm([]);
    setModal("create");
  };

  const openEdit = (v: VehiculoDB) => {
    setForm({ ...v, puestoSeleccionado: "" });
    setSelected(v);
    setErroresForm([]);
    setModal("edit");
  };

  const openView = (v: VehiculoDB) => {
    setSelected(v);
    setModal("view");
  };

  const cerrarModalForm = () => {
    setModal(null);
    setErroresForm([]);
  };

  const save = async () => {
    // Las validaciones se acumulan para que el operador vea TODO lo que falta
    // de una sola vez, dentro del modal.
    const errs: string[] = [];

    if (modal === "create") {
      if (!esPlacaValida(form.placa || "")) errs.push("La placa debe tener 3 letras y 3 números (ej. ABC123)");
      if (!esDocumentoValido(form.doc || "")) errs.push("El documento del propietario debe tener entre 6 y 12 dígitos");
      if (form.telefono && !esTelefonoValido(form.telefono)) errs.push("El teléfono debe tener 10 dígitos");
      if (!sinAngular(form.nombre || "") || !sinAngular(form.color || "")) errs.push("Nombre o color contienen caracteres no permitidos (< >)");
      if (!form.puestoSeleccionado) errs.push("Debe asignar un puesto libre al contrato");
      if (form.precio != null && form.precio < 0) errs.push("El precio no puede ser negativo");
      if (form.dia_pago != null && (form.dia_pago < 1 || form.dia_pago > 31)) errs.push("El día de pago debe estar entre 1 y 31");
      if (!form.clase_vehiculo) errs.push("Seleccione la clase de vehículo");
    } else {
      if (!sinAngular(form.nombre || "")) errs.push("El nombre contiene caracteres no permitidos (< >)");
    }

    if (errs.length) {
      setErroresForm(errs);
      return;
    }
    setErroresForm([]);

    if (modal === "create") {
      const res = await fetchSeguro("/api/vehiculos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: form.placa?.toUpperCase(),
          doc: form.doc,
          nombre: form.nombre,
          telefono: form.telefono,
          color: form.color || "No especificado",
          clase: form.clase_vehiculo,
          puestosIdPuesto: Number(form.puestoSeleccionado),
          precio: form.precio ?? undefined,
          diaPago: form.dia_pago ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alertaError(data.error || "No se pudo registrar el vehículo");
        return;
      }
      alertaExito("Vehículo registrado y asignado al puesto.");
      await loadInactivos();
    } else {
      const putBody: Record<string, unknown> = {
        color: form.color || "",
      };
      if (form.nombre?.trim()) putBody.nombre = form.nombre.trim();
      if (form.puestoSeleccionado) putBody.puestosIdPuesto = Number(form.puestoSeleccionado);
      // Las condiciones económicas solo existen para mensual. Un diario las
      // descarta: precio/día de pago se guardan en contratos, no en tickets.
      if (form.tipo === "mensual") {
        putBody.precio = form.precio ?? undefined;
        putBody.diaPago = form.dia_pago ?? undefined;
        putBody.pagado = !!form.pagado;
      }
      putBody.clase = form.clase_vehiculo;

      const res = await fetchSeguro(`/api/vehiculos/${form.placa}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(putBody),
      });
      const data = await res.json();
      if (!res.ok) {
        alertaError(data.error || "No se pudo actualizar");
        return;
      }
      alertaExito("Vehículo actualizado.");
      await loadInactivos();
    }
    setModal(null);
    setErroresForm([]);
    await loadPuestos();
  };

  const inactivar = async (placa: string) => {
    const ok = await confirmar(
      `¿Enviar el vehículo ${placa} a la papelera y liberar su puesto?`,
      "Inactivar vehículo",
      "Sí, inactivar"
    );
    if (!ok) return;

    // El cambio de estado libera el puesto en el modelo (contrato vigente +
    // tickets abiertos). No hace falta mandar `puestosIdPuesto: null`: el
    // route lo descartaría por ser falsy igualmente.
    const res = await fetchSeguro(`/api/vehiculos/${placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "inactivo" }),
    });

    const data = await res.json();
    if (!res.ok) {
      alertaError(data.error || "No se pudo inactivar el vehículo");
      return;
    }
    alertaExito("Vehículo enviado a papelera y puesto liberado.");
    setModal(null);
    await loadPuestos();
    await loadInactivos();
  };

  // Reactivación desde el mapa: el vehículo inactivo ya no tiene puesto en BD
  // (el modelo lo desvinculó al inactivar), así que el estado y la ubicación
  // viajan juntos en un solo PATCH.
  const colocarEnPuesto = async (puesto: PuestoDB) => {
    if (!colocando || puesto.estado_puesto) return;

    const ok = await confirmar(
      `¿Reactivar ${colocando.placa} en el puesto P-${puesto.numero_puesto}?`,
      "Reactivar vehículo",
      "Sí, reactivar"
    );
    if (!ok) return;

    const res = await fetchSeguro(`/api/vehiculos/${colocando.placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estado: "activo",
        puestosIdPuesto: Number(puesto.id),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alertaError(data.error || "No se pudo reactivar el vehículo");
      return;
    }
    alertaExito(`Vehículo ${colocando.placa} reactivado en P-${puesto.numero_puesto}.`);
    setColocando(null);
    await loadPuestos();
    await loadInactivos();
  };

  // Reasignación táctil: mismo PATCH de drag&drop, pero sin arrastrar. Se entra
  // por long-press de 3 s sobre el chip.
  const moverAPuesto = async (puesto: PuestoDB) => {
    if (!moviendo || puesto.estado_puesto) return;

    const res = await fetchSeguro(`/api/vehiculos/${moviendo.placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puestosIdPuesto: Number(puesto.id) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alertaError(data.error || "No se pudo mover el vehículo");
      return;
    }
    alertaExito(`Vehículo ${moviendo.placa} movido a P-${puesto.numero_puesto}.`);
    setMoviendo(null);
    await loadPuestos();
  };

  // Alterna el estado de pago desde el menú contextual del mapa.
  const marcarPagado = async (placa: string, pagado: boolean) => {
    setMenu(null);
    const res = await fetchSeguro(`/api/vehiculos/${placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagado }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alertaError(data.error || "No se pudo actualizar el estado de pago");
      return;
    }
    alertaExito(pagado ? "Marcado como pagado." : "Marcado como pendiente.");
    await loadPuestos();
  };

  // --- LONG-PRESS DEL CHIP (solo puntero táctil) ---
  // Arma los dos timers; cualquier movimiento fuera del umbral o levantamiento
  // del dedo antes de sus umbrales los cancela. A los 3 s entra en modo
  // "mover"; a los 6 s escala al menú de pago y cancela el modo previo.
  const cancelarLongPress = () => {
    inicioToque.current = null;
    if (longPressMoverRef.current) {
      clearTimeout(longPressMoverRef.current);
      longPressMoverRef.current = null;
    }
    if (longPressPagoRef.current) {
      clearTimeout(longPressPagoRef.current);
      longPressPagoRef.current = null;
    }
  };

  const iniciarLongPress = (e: React.TouchEvent, v: VehiculoPuesto) => {
    // En modo "colocar" (reactivación) el chip no debe abrir otro modo: el
    // operador está eligiendo puesto, no moviendo un activo.
    if (!canEdit || colocando) return;
    const t = e.touches[0];
    if (!t) return;
    const x = t.clientX;
    const y = t.clientY;

    longPressConsumido.current = false;
    cancelarLongPress();
    // cancelarLongPress limpia el ancla; se re-fija aquí porque el gesto sigue.
    inicioToque.current = { x, y };

    // 3 s: entra en modo "mover". El vehículo ya está colocado, así que no hay
    // chip flotante: se espera el tap en un puesto libre.
    longPressMoverRef.current = setTimeout(() => {
      longPressMoverRef.current = null;
      setMenu(null);
      setMoviendo({ placa: v.placa, pagado: !!v.pagado });
    }, MS_LONG_PRESS_MOVER);

    // 6 s: escala al menú de pago. Cancela el modo "mover" si ya se había
    // activado — dos estados simultáneos confundirían al operador.
    longPressPagoRef.current = setTimeout(() => {
      longPressPagoRef.current = null;
      longPressConsumido.current = true;
      setMoviendo(null);
      setMenu({ placa: v.placa, x, y, pagado: !!v.pagado });
    }, MS_LONG_PRESS_PAGO);
  };

  const moverLongPress = (e: React.TouchEvent) => {
    if (!inicioToque.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - inicioToque.current.x;
    const dy = t.clientY - inicioToque.current.y;
    // Solo cancela si el dedo se movió lo suficiente para indicar scroll real.
    if (Math.hypot(dx, dy) > UMBRAL_MOVIMIENTO) cancelarLongPress();
  };

  // --- LÓGICA DE DRAG AND DROP (MAPA INTERACTIVO) ---
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, placa: string) => {
    e.dataTransfer.setData("placa", placa);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetPuestoId: string, ocupado: boolean) => {
    e.preventDefault();
    const placa = e.dataTransfer.getData("placa");
    if (!placa) return;

    if (ocupado) {
      alertaAdvertencia("Este puesto ya está ocupado");
      return;
    }

    const ok = await confirmar(`¿Mover vehículo ${placa} a este puesto?`, "Mover Vehículo", "Sí, mover");
    if (!ok) return;

    const res = await fetchSeguro(`/api/vehiculos/${placa}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puestosIdPuesto: Number(targetPuestoId) }),
    });

    if (!res.ok) {
      const data = await res.json();
      alertaError(data.error || "Error al mover el vehículo");
      return;
    }

    alertaExito("Vehículo movido con éxito.");
    await loadPuestos();
  };

  const obtenerIconoClase = (clase?: string) => {
    const n = (clase || "").toLowerCase();
    if (n.startsWith("moto")) return "🏍️";
    if (n.startsWith("bus")) return "🚌";
    if (n.startsWith("cami")) return "🚚"; // cubre camioneta y camión
    if (n.startsWith("auto")) return "🚗";
    return "🚗";
  };

  // --- CONTRATO EN PDF ---

  // El input de archivo es único y sólo carga la firma del parqueadero.
  const manejarFirma = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0] ?? null;
    // Se limpia el input para poder volver a elegir el mismo archivo.
    e.target.value = "";
    if (!archivo) return;

    if (!archivo.type.startsWith("image/")) {
      alertaAdvertencia("La firma debe ser una imagen PNG o JPG");
      return;
    }

    try {
      const dataUrl = await normalizarFirma(archivo);
      setFirmaGerente(dataUrl);
      try {
        localStorage.setItem(CLAVE_FIRMA_GERENTE, dataUrl);
      } catch {
        // Sin persistencia la firma sigue válida para esta sesión.
      }
      alertaExito("Firma del parqueadero guardada.");
    } catch {
      alertaError("No se pudo procesar la imagen de la firma");
    }
  };

  // Arma el contrato a partir del vehículo. Todos los campos opcionales
  // arrancan marcados; el gerente desmarca los que no deban viajar en el PDF.
  const abrirContrato = (v: VehiculoDB) => {
    // Cuenta destino y tipo de pago se recuerdan entre contratos. La cuenta del
    // parqueadero no cambia; volver a escribirla cada vez es fricción pura.
    let tipoPago: string | null = null;
    let numeroCuenta: string | null = null;
    try {
      tipoPago = localStorage.getItem(CLAVE_TIPO_PAGO);
      numeroCuenta = localStorage.getItem(CLAVE_NUMERO_CUENTA);
    } catch {
      // Modo privado o almacenamiento bloqueado: se sigue sin persistencia.
    }

    setContrato({
      datos: {
        placa: v.placa,
        nombre: v.nombre,
        doc: v.doc || "—",
        telefono: v.telefono ?? null,
        correo: v.correo ?? null,
        color: v.color ?? null,
        clase: v.clase_vehiculo ?? null,
        puesto: v.puesto ?? null,
        ingreso: v.ingreso ?? null,
        precio: v.precio ?? null,
        dia_pago: v.dia_pago ?? null,
        pagado: v.pagado ?? null,
        // "Banco Caja Social" arranca por defecto: es el caso del 90% de los
        // contratos. El gerente lo cambia solo cuando cobra por otro medio.
        tipo_pago: tipoPago ?? "Banco Caja Social",
        numero_cuenta: numeroCuenta,
      },
      incluir: { ...INCLUIR_DEFAULT },
      editando: false,
      compartiendo: false,
    });
  };

  // Vuelca el estado del modal en el objeto que consume el generador de PDF.
  // El mapa `incluir` viaja aparte: el generador omite las filas desmarcadas en
  // vez de pintarlas como "—". El logo no se fija aquí: al omitirlo, el
  // generador resuelve el suyo desde lib/logoPdf.
  const formatearContrato = (c: ContratoState) => {
    let datos: DatosContratoPDF = {
      placa: c.datos.placa,
      nombre: c.datos.nombre,
      doc: c.datos.doc,
      firmaGerente,
    };
    for (const campo of CAMPOS_CONTRATO) {
      if (c.incluir[campo.clave] === false) continue;
      datos = campo.escribir(datos, campo.valor(c.datos));
    }
    return { datos, incluir: c.incluir };
  };

  const exportarContrato = () => {
    if (!contrato) return;
    const { datos, incluir } = formatearContrato(contrato);
    descargarContratoPDF(datos, { incluir });
    alertaExito("Contrato descargado.");
  };

  const compartirContrato = async () => {
    if (!contrato || contrato.compartiendo) return;

    setContrato(c => (c ? { ...c, compartiendo: true } : c));
    try {
      const { datos, incluir } = formatearContrato(contrato);
      const via = await compartirContratoPDF(datos, { incluir });
      if (via === "descargado") {
        alertaAdvertencia("Este navegador no comparte archivos. El contrato se descargó.");
      }
    } catch {
      alertaError("No se pudo compartir el contrato");
    } finally {
      setContrato(c => (c ? { ...c, compartiendo: false } : c));
    }
  };

  // Estadísticas rápidas
  const puestosOcupados = puestos.filter(p => p.estado_puesto).length;
  const puestosTotales = puestos.length;

  return (
    <div>
      {/* HEADER DE LA PÁGINA */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Mapa del Parqueadero</h2>
          <p style={{ color: C.sub, fontSize: 14 }}>
            Ocupación: {puestosOcupados} / {puestosTotales} puestos
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {/* Input único de firma: lo dispara el botón del encabezado. */}
          <input
            ref={firmaInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={manejarFirma}
            style={{ display: "none" }}
          />
          {canCreate && (
            <Boton
              variant="outline"
              title="Cargar o reemplazar la firma del parqueadero"
              onClick={() => firmaInputRef.current?.click()}
            >
              🖋️ {firmaGerente ? "Firma guardada" : "Firma"}
            </Boton>
          )}
          {canInactivate && (
            <Boton
              variant="outline"
              onClick={async () => { await loadInactivos(); setPapeleraAbierta(true); }}
            >
              🗑️ Papelera {inactivos.length > 0 && `(${inactivos.length})`}
            </Boton>
          )}
          {canCreate && <Boton onClick={openCreate}>+ Registrar Vehículo</Boton>}
        </div>
      </div>

      {/* VISTA MAPA INTERACTIVO */}
      <Tarjeta style={{ background: C.surface, padding: 24 }}>
        {colocando && (
          <div style={{
            marginBottom: 16, padding: "10px 14px", borderRadius: 8,
            background: "#fef3c7", border: "1px solid #f59e0b",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 13, color: "#78350f" }}>
              Colocando <b>{colocando.placa}</b>. Haz clic en un puesto libre para reactivarlo, o pulsa ESC para cancelar.
            </span>
            <Boton small variant="ghost" onClick={() => setColocando(null)}>Cancelar</Boton>
          </div>
        )}

        {moviendo && (
          <div style={{
            marginBottom: 16, padding: "10px 14px", borderRadius: 8,
            background: "#dbeafe", border: "1px solid #3b82f6",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,position: "fixed", top: 10,
          }}>
            <span style={{ fontSize: 13, color: "#1e3a8a" }}>
              Moviendo <b>{moviendo.placa}</b>. Toca un puesto libre para reasignarlo, o pulsa ESC para cancelar.
            </span>
            <Boton small variant="ghost" onClick={() => setMoviendo(null)}>Cancelar</Boton>
          </div>
        )}

        <p style={{ color: C.sub, fontSize: 14, marginBottom: 12 }}>
          {esTactil
            ? `Mantén pulsado ${MS_LONG_PRESS_MOVER / 1000} s sobre un vehículo para moverlo de puesto; ${MS_LONG_PRESS_PAGO / 1000} s para marcar su pago. Toca el chip para ver sus detalles.`
            : "Arrastra los vehículos para moverlos de puesto. Haz clic en un vehículo para ver sus detalles o clic derecho para marcar su pago."}
        </p>

        <div style={{ position: "relative" }}>
          {/* Widget flotante de zoom: no forma parte del área scrollable */}
          <div
            style={{
              position: "absolute",
              top: -50,
              right: -20,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: 4,
              boxShadow: "0 4px 12px rgba(0,0,0,.25)",
            }}
          >
            <Boton
              small
              variant="ghost"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              title="Reducir"
            >
              −
            </Boton>
            <span
              style={{
                fontSize: 12,
                minWidth: 42,
                textAlign: "center",
                color: C.sub,
                fontWeight: 700,
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <Boton
              small
              variant="ghost"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              title="Ampliar"
            >
              +
            </Boton>
            <Boton small variant="ghost" onClick={zoomReset} title="Restablecer">
              ⟲
            </Boton>
          </div>

          {/*
            Área del mapa: acotada a la altura restante del viewport. `dvh` respeta
            la barra de URL móvil (que `vh` ignora y empuja la página hacia abajo).
            Si el parqueadero no cabe a zoom=1, el usuario reduce con “−”.
          */}
          <div
            style={{
              height: "438px",
              minHeight: 240,
              overflow: "auto",
              paddingRight: 4,
            }}
          >
            {/*
              `zoom` (CSS) reescala la caja Y la métrica del layout: el contenedor
              ve el tamaño encogido y no deja hueco, a diferencia de transform:scale
              que mantiene el layout original. Chromium, Safari y Firefox 126+ lo
              soportan.
            */}
            <div style={{ zoom }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))",
                  gap: 10,
                }}
              >
                {puestos.map(p => {
                  const v = p.vehiculoActual;
                  const ocupado = p.estado_puesto && !!v;
                  // Los modos resaltables: colocar (reactivar) y mover (táctil).
                  const enModoDestino = (!!colocando || !!moviendo) && !ocupado;
                  const resaltado = enModoDestino && puestoHover === p.id;

                  return (
                    <div
                      key={p.id}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, p.id, ocupado)}
                      onClick={() => {
                        if (colocando && !ocupado) colocarEnPuesto(p);
                        else if (moviendo && !ocupado) moverAPuesto(p);
                      }}
                      onMouseEnter={() => { if (enModoDestino) setPuestoHover(p.id); }}
                      onMouseLeave={() => setPuestoHover(null)}
                      style={{
                        border: `2px dashed ${resaltado ? "#4ade80" : ocupado ? "transparent" : C.border}`,
                        background: resaltado ? "#dcfce3" : ocupado ? `${C.accent}0F` : "transparent",
                        cursor: enModoDestino ? "crosshair" : undefined,
                        borderRadius: 8,
                        height: 100,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        transition: "background .15s",
                      }}
                    >
                      {!ocupado && (
                        <span
                          style={{
                            position: "absolute", top: 4, left: 6,
                            fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: .3,
                          }}
                        >
                          libre
                        </span>
                      )}

                      <span
                        style={{
                          fontFamily: "Syne", fontWeight: 800, fontSize: 26,
                          color: ocupado ? C.accent : C.muted, lineHeight: 1,
                        }}
                      >
                        {p.numero_puesto}
                      </span>

                      {ocupado && v && (
                        <div
                          // Clase global que apaga el menú de copiar/seleccionar de
                          // iOS sobre chips; sin ella el long-press nativo se come
                          // el touchstart propio.
                          className="chip-vehiculo"
                          // `draggable` sólo en puntero fino. En táctil el gesto lo
                          // maneja el long-press de abajo.
                          draggable={canEdit && !esTactil}
                          onDragStart={(e) => handleDragStart(e, v.placa)}
                          onTouchStart={(e) => iniciarLongPress(e, v)}
                          onTouchMove={moverLongPress}
                          onTouchEnd={cancelarLongPress}
                          onTouchCancel={cancelarLongPress}
                          onMouseEnter={() => setHover(v.placa)}
                          onMouseLeave={() => setHover(null)}
                          onContextMenu={e => {
                            e.preventDefault();
                            if (!canEdit) return;
                            // En táctil, Android sintetiza `contextmenu` a ~500 ms y abriría el menú
                            // mucho antes del umbral de 10 s. El menú queda exclusivo del long-press
                            // sostenido; en escritorio sigue respondiendo al clic derecho.
                            if (esTactil) return;
                            setMenu({ placa: v.placa, x: e.clientX, y: e.clientY, pagado: !!v.pagado });
                          }}
                          onClick={() => {
                            // Un long-press que ya abrió el menú no debe además
                            // abrir el detalle al levantar el dedo.
                            if (longPressConsumido.current) {
                              longPressConsumido.current = false;
                              return;
                            }
                            if (colocando || moviendo) return;
                            openView({
                              placa: v.placa,
                              nombre: v.nombre,
                              tipo: v.tipo,
                              tipo_icono: v.tipo_icono || undefined,
                              clase_vehiculo: v.clase_vehiculo || undefined,
                              color: v.color || "",
                              doc: v.doc,
                              telefono: v.telefono || undefined,
                              puesto: String(p.numero_puesto),
                              ingreso: v.ingreso,
                              precio: v.precio,
                              dia_pago: v.dia_pago,
                              pagado: v.pagado,
                            });
                          }}
                          style={{
                            marginTop: 6,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                            cursor: canEdit ? (esTactil ? "pointer" : "grab") : "pointer",
                            userSelect: "none",
                          }}
                        >
                          <span style={{ fontSize: 20, lineHeight: 1 }}>{v.tipo_icono || "🚗"}</span>
                          <span style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 10, color: C.text }}>
                            {v.placa}
                          </span>
                        </div>
                      )}

                      {!esTactil && hover === v?.placa && v && (
                        <div
                          style={{
                            position: "absolute", top: "100%", left: 0, zIndex: 10,
                            marginTop: 6, padding: "8px 10px", minWidth: 170,
                            background: C.card, border: `1px solid ${C.border}`,
                            borderRadius: 8, fontSize: 11, color: C.text,
                            boxShadow: "0 6px 18px rgba(0,0,0,.5)", whiteSpace: "nowrap",
                            pointerEvents: "none",
                          }}
                        >
                          <div>
                            <b>Precio:</b>{" "}
                            {v.precio != null ? `$${Number(v.precio).toLocaleString("es-CO")}` : "—"}
                          </div>
                          <div><b>Día de pago:</b> {v.dia_pago ?? "—"}</div>
                          <div>
                            <b>Estado:</b>{" "}
                            <span style={{ color: v.pagado ? C.green : C.red, fontWeight: 700 }}>
                              {v.pagado ? "Pagado" : "Pendiente"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Tarjeta>

      {/* CONTEXT MENU: solo acciones de pago. Se abre con clic derecho en
          escritorio y con long-press sostenido en móvil. */}
      {menu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            // Fallback al punto crudo en el primer render; el layout effect de
            // arriba lo ajusta antes de que el navegador pinte.
            top:  menuPos?.y ?? menu.y,
            left: menuPos?.x ?? menu.x,
            zIndex: 1000,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,.5)",
            minWidth: 170,
          }}
          onClick={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          <Boton
            small
            variant={menu.pagado ? "outline" : "primary"}
            onClick={() => marcarPagado(menu.placa, !menu.pagado)}
          >
            {menu.pagado ? "Marcar pendiente" : "Marcar pagado"}
          </Boton>
        </div>
      )}

      {/* MODAL CREAR / EDITAR */}
      {(modal === "create" || modal === "edit") && (
        <Modal title={modal === "create" ? "Registrar Vehículo" : "Editar Vehículo"} onClose={cerrarModalForm}>
          <FilaFormulario label="Placa">
            <input
              value={form.placa || ""}
              onChange={e => setForm({ ...form, placa: e.target.value.toUpperCase() })}
              maxLength={6}
              placeholder="ABC123"
              disabled={modal === "edit"}
            />
          </FilaFormulario>

          <FilaFormulario label="Nombre del propietario">
            <input value={form.nombre || ""} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          </FilaFormulario>

          {modal === "create" && (
            <>
              <FilaFormulario label="Documento del propietario">
                <input value={form.doc || ""} onChange={e => setForm({ ...form, doc: e.target.value })} maxLength={12} />
              </FilaFormulario>
              <FilaFormulario label="Teléfono del propietario (opcional)">
                <input value={form.telefono || ""} onChange={e => setForm({ ...form, telefono: e.target.value })} maxLength={10} placeholder="3001234567" />
              </FilaFormulario>
            </>
          )}

          <FilaFormulario label="Clase de vehículo">
            <select
              value={form.clase_vehiculo || ""}
              onChange={e => setForm({ ...form, clase_vehiculo: e.target.value })}
            >
              <option value="">Seleccione…</option>
              {tiposVeh.map(t => (
                <option key={t.id} value={t.nombre}>{t.icono} {t.nombre}</option>
              ))}
            </select>
          </FilaFormulario>

          <FilaFormulario label="Color">
            <input value={form.color || ""} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="Ej: Rojo" />
          </FilaFormulario>

          {/* Condiciones económicas: sólo el contrato mensual las soporta. */}
          {form.tipo === "mensual" && (
            <>
              <FilaFormulario label="Precio mensual">
                <input
                  type="number"
                  min={0}
                  value={form.precio ?? ""}
                  onChange={e =>
                    setForm({ ...form, precio: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="Ej: 150000"
                />
              </FilaFormulario>

              <FilaFormulario label="Día de pago (1-31)">
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.dia_pago ?? ""}
                  onChange={e =>
                    setForm({ ...form, dia_pago: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="Ej: 5"
                />
              </FilaFormulario>

              {modal === "edit" && (
                <FilaFormulario label="Estado del pago">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!form.pagado}
                      onChange={e => setForm({ ...form, pagado: e.target.checked })}
                    />
                    <span style={{ fontSize: 13, color: C.sub }}>Marcar como pagado</span>
                  </label>
                </FilaFormulario>
              )}
            </>
          )}

          {modal === "create" && (
            <FilaFormulario label="Puesto a asignar">
              <select value={form.puestoSeleccionado || ""} onChange={e => setForm({ ...form, puestoSeleccionado: e.target.value })}>
                <option value="">Seleccione un puesto libre…</option>
                {puestosLibres.map(p => <option key={p.id} value={p.id}>Puesto {p.numero_puesto}</option>)}
              </select>
            </FilaFormulario>
          )}
          
          {modal === "edit" && (
            <FilaFormulario label="Puesto asignado">
              <select value={form.puestoSeleccionado || ""} onChange={e => setForm({ ...form, puestoSeleccionado: e.target.value })}>
                <option value="">Mantener puesto actual ({form.puesto || "—"})</option>
                {puestosLibres.map(p => <option key={p.id} value={p.id}>Puesto {p.numero_puesto}</option>)}
              </select>
            </FilaFormulario>
          )}

          {/* Validaciones inline: muestran todas las faltas en el mismo modal,
              sin que un popup central tape el campo a corregir. */}
          {erroresForm.length > 0 && (
            <div
              style={{
                background: `${C.red}1A`,
                border: `1px solid ${C.red}66`,
                borderRadius: 8,
                padding: "8px 10px",
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {erroresForm.map((msg, i) => (
                <p key={i} style={{ color: C.red, fontSize: 12, lineHeight: 1.4 }}>• {msg}</p>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Boton onClick={save} data-nav-submit style={{ flex: 1 }}>Guardar</Boton>
            <Boton variant="ghost" onClick={cerrarModalForm} style={{ flex: 1 }}>Cancelar</Boton>
          </div>
        </Modal>
      )}

      {/* MODAL VER DETALLE (Con botón de Inactivar) */}
      {modal === "view" && selected && (
        <Modal title="Detalle del Vehículo" onClose={() => setModal(null)}>
          {([
            ["Placa", selected.placa],
            ["Clase", `${selected.tipo_icono || "🚗"} ${selected.clase_vehiculo || "Carro"}`],
            ["Tipo", selected.tipo],
            ["Color", selected.color || "—"],
            ["Propietario", selected.nombre],
            ["Documento", selected.doc || "—"],
            ["Teléfono", selected.telefono || "—"],
            ["Puesto Actual", selected.puesto || "—"],
            [selected.tipo === "mensual" ? "Inicio contrato" : "Ingreso", selected.ingreso || "—"],
            ["Precio mensual", selected.precio != null ? `$${Number(selected.precio).toLocaleString("es-CO")}` : "—"],
            ["Día de pago", selected.dia_pago != null ? `Día ${selected.dia_pago}` : "—"],
            ["Estado del pago", selected.pagado ? "Pagado" : "Pendiente"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.sub, fontSize: 13 }}>{k}</span>
              <span style={{ fontWeight: 600, fontSize: 13, textAlign: "right", marginLeft: 12 }}>{v}</span>
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            {selected.tipo === "mensual" && (
              <Boton variant="outline" onClick={() => abrirContrato(selected)}>
                📄 Contrato PDF
              </Boton>
            )}
            {canEdit && (
              <Boton variant="outline" onClick={() => openEdit(selected)} style={{ flex: 1 }}>
                ✏️ Editar
              </Boton>
            )}
            {canInactivate && selected.tipo === "mensual" && (
              <Boton danger onClick={() => inactivar(selected.placa)} style={{ flex: 1 }}>
                🗑️ Inactivar
              </Boton>
            )}
          </div>
        </Modal>
      )}

      {/* MODAL CONTRATO: selección de campos, edición y salida */}
      {contrato && (
        <Modal title="Contrato de parqueo mensual" onClose={() => setContrato(null)} width={640}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <Etiqueta label={`Puesto ${contrato.datos.puesto || "—"}`} color="blue" />
            <Etiqueta
              label={contrato.datos.pagado ? "Pagado" : "Pendiente"}
              color={contrato.datos.pagado ? "green" : "gold"}
            />
            <Etiqueta
              label={firmaGerente ? "Firma del parqueadero" : "Falta firma del parqueadero"}
              color={firmaGerente ? "green" : "red"}
            />
          </div>

          {/* Datos de identificación: siempre viajan en el contrato. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: C.sub, width: 120, flex: "0 0 auto" }}>Placa</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{contrato.datos.placa}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: C.sub, width: 120, flex: "0 0 auto" }}>Propietario</span>
            {contrato.editando ? (
              <input
                style={{ flex: 1 }}
                value={contrato.datos.nombre}
                onChange={e => setContrato(c => (c ? { ...c, datos: { ...c.datos, nombre: e.target.value } } : c))}
              />
            ) : (
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{contrato.datos.nombre}</span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: C.sub, width: 120, flex: "0 0 auto" }}>Documento</span>
            {contrato.editando ? (
              <input
                style={{ flex: 1 }}
                value={contrato.datos.doc}
                onChange={e => setContrato(c => (c ? { ...c, datos: { ...c.datos, doc: e.target.value } } : c))}
              />
            ) : (
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{contrato.datos.doc}</span>
            )}
          </div>

          {/* Campos opcionales: el checkbox decide si entran al PDF. */}
          {CAMPOS_CONTRATO.map(campo => {
            const incluido = contrato.incluir[campo.clave] !== false;
            return (
              <div
                key={campo.clave}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}
              >
                <input
                  type="checkbox"
                  checked={incluido}
                  title="Incluir en el contrato"
                  onChange={e =>
                    setContrato(c => (c ? { ...c, incluir: { ...c.incluir, [campo.clave]: e.target.checked } } : c))
                  }
                  style={{ width: 15, height: 15, flex: "0 0 auto", cursor: "pointer" }}
                />
                <span style={{ fontSize: 12, color: C.sub, width: 105, flex: "0 0 auto" }}>{campo.etiqueta}</span>

                {contrato.editando ? (
                  campo.clave === "pagado" ? (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={campo.valor(contrato.datos) === "true"}
                        onChange={e =>
                          setContrato(c =>
                            c ? { ...c, datos: campo.escribir(c.datos, e.target.checked ? "true" : "false") } : c
                          )
                        }
                      />
                      <span style={{ fontSize: 12, color: C.sub }}>Pagado</span>
                    </label>
                  ) : campo.opciones ? (
                    <select
                      style={{ flex: 1 }}
                      value={campo.valor(contrato.datos)}
                      onChange={e =>
                        setContrato(c => (c ? { ...c, datos: campo.escribir(c.datos, e.target.value) } : c))
                      }
                    >
                      {/* Opción vacía: permite blanquear el campo sin forzar uno de la lista. */}
                      <option value="">—</option>
                      {campo.opciones.map(op => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      style={{ flex: 1 }}
                      type={campo.clave === "precio" || campo.clave === "dia_pago" ? "number" : "text"}
                      value={campo.valor(contrato.datos)}
                      onChange={e =>
                        setContrato(c => (c ? { ...c, datos: campo.escribir(c.datos, e.target.value) } : c))
                      }
                    />
                  )
                ) : (
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, opacity: incluido ? 1 : .4 }}>
                    {mostrarCampo(campo, contrato.datos)}
                  </span>
                )}
              </div>
            );
          })}

          <p style={{ fontSize: 12, color: C.sub, marginTop: 14 }}>
            La fecha y las tarifas quedan impresas en el PDF. Usa ✏️ para corregir
            cualquier valor antes de generarlo.
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <Boton
              variant={contrato.editando ? "primary" : "outline"}
              onClick={() => setContrato(c => (c ? { ...c, editando: !c.editando } : c))}
            >
              {contrato.editando ? "✔ Listo" : "✏️ Editar"}
            </Boton>
            <Boton onClick={exportarContrato}>📄 Descargar</Boton>
            <Boton variant="outline" disabled={contrato.compartiendo} onClick={compartirContrato}>
              {contrato.compartiendo ? "Compartiendo…" : "📤 Compartir"}
            </Boton>
          </div>
        </Modal>
      )}

      {/* MODAL PAPELERA (Historial de inactivos) */}
      {papeleraAbierta && (
        <Modal title="Vehículos Inactivados (Contratos)" onClose={() => setPapeleraAbierta(false)}>
          {inactivos.length === 0 ? (
            <p style={{ color: C.sub, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No hay vehículos inactivados en la papelera.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {inactivos.map(v => (
                <div key={v.placa} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "rgba(0,0,0,0.02)", borderRadius: 8, border: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{obtenerIconoClase(v.clase_vehiculo)}</span>
                      <p style={{ fontWeight: 700, fontFamily: "Syne", fontSize: 16 }}>{v.placa}</p>
                      <Etiqueta label="Inactivo" color="red" />
                    </div>
                    <p style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Propietario: {v.nombre}</p>
                    <p style={{ color: C.sub, fontSize: 12 }}>Último puesto conocido: {v.puesto || "Ninguno"}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {/* Reactivar no dispara el PATCH aquí: pasa al modo
                        "colocar" en el mapa, donde el puesto se elige con un
                        clic y el estado viaja en el mismo request. */}
                    <Boton small variant="outline" onClick={() => {
                      setPapeleraAbierta(false);
                      setMoviendo(null);
                      setColocando(v);
                    }}>
                      Reactivar
                    </Boton>
                    <Boton small danger onClick={async () => {
                        const ok = await confirmar(`¿Eliminar definitivamente la placa ${v.placa}?`, "Eliminar de base de datos", "Sí, eliminar");
                        if (!ok) return;
                        const res = await fetchSeguro(`/api/vehiculos/${v.placa}`, { method: "DELETE" });
                        if (!res.ok) { alertaError("No se pudo eliminar"); return; }
                        alertaExito("Vehículo eliminado permanentemente.");
                        await loadInactivos();
                      }}>
                      Borrar
                    </Boton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* CHIP FLOTANTE: sigue al puntero mientras el modo "colocar" está activo */}
      {colocando && mouse && (
        <div
          style={{
            position: "fixed",
            left: mouse.x + 14,
            top: mouse.y + 14,
            padding: "8px 12px",
            background: "#e0f2fe",
            border: "1px solid #38bdf8",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            pointerEvents: "none",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "Syne",
            color: "#1e293b",
          }}
        >
          <span style={{ fontSize: 18 }}>{obtenerIconoClase(colocando.clase_vehiculo)}</span>
          {colocando.placa}
        </div>
      )}
    </div>
  );
}
