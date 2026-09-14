// Marca este modulo como codigo de cliente.
// Es obligatorio porque usa hooks, window, document y estado de React.
"use client";

// Importa herramientas de React para crear contexto, hooks y tipos.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Alerta visual usada cuando se cierra sesion por inactividad.
import { alertaAdvertencia } from "@/lib/alerta";

// fetchSeguro agrega el token CSRF en peticiones que modifican datos.
import { fetchSeguro } from "@/lib/fetchSeguro";

// Activa una mejora de navegacion con Enter en formularios.
import { activarNavegacionEnter } from "@/lib/navegacion";

// Define la forma del contexto de autenticacion.
interface AuthContextType {
  // Usuario actual; null significa que no hay sesion activa.
  user: Usuario | null;
  // Indica si todavia se esta consultando /api/auth/me.
  cargando: boolean;
  // Funcion para iniciar sesion con documento y contrasena.
  login: (doc: string, password: string) => Promise<{ ok: boolean; error: string }>;
  // Funcion para cerrar sesion.
  logout: () => Promise<void>;
}

// Tipo usado por el frontend para representar al usuario autenticado.
type Usuario = {
  // Identificador numerico, normalmente el documento convertido a numero.
  id: number;
  // Documento como texto para no perder formato al mostrarlo o enviarlo.
  doc: string;
  // Nombre visible del usuario.
  name: string;
  // Rol: gerente, empleado o cliente.
  role: string;
  // Correo opcional del usuario.
  email?: string;
  // Telefono opcional del usuario.
  phone?: string;
  // Estado operativo opcional: activo, trabajando, descansando, etc.
  estado?: string;
};

// Crea el contexto con valores por defecto.
// Estos defaults evitan errores si alguien usa useAuth fuera del provider.
const AuthContext = createContext<AuthContextType>({
  user: null,
  cargando: true,
  // Implementacion falsa: indica que falta el provider real.
  login: async () => ({ ok: false, error: "Invalid implementation" }),
  // Funcion vacia para cumplir el contrato del contexto.
  logout: async () => {},
});

// Provider que envuelve la app y administra la sesion en memoria.
export function AuthProvider({ children }: { children: ReactNode }) {
  // Estado React que guarda el usuario autenticado.
  const [user, setUser] = useState<Usuario | null>(null);
  // Estado React que indica si la sesion se esta hidratando.
  const [cargando, setCargando] = useState(true);

  // Efecto de inicializacion que corre una sola vez al montar el provider.
  useEffect(() => {
    // Solicita al servidor una cookie CSRF para proteger POST/PATCH/PUT/DELETE.
    fetch("/api/csrf").catch(() => {});
    // Activa navegacion con Enter entre campos/formularios.
    activarNavegacionEnter();
  }, []);

  // Efecto que intenta recuperar la sesion al cargar o recargar la pagina.
  useEffect(() => {
    // Bandera para no actualizar estado si el componente ya se desmonto.
    let activo = true;

    // Funcion interna que consulta /api/auth/me y maneja reintentos.
    async function hidratar() {
      // Hasta 3 intentos. Sólo se agota el bucle con 503/red caída; 401 y 200
      // cortan el ciclo de inmediato.
      // intento vale 0, 1 y 2; por eso hay tres oportunidades.
      for (let intento = 0; intento < 3; intento++) {
        try {
          // Pregunta al backend si existe una sesion valida en la cookie httpOnly.
          const res = await fetch("/api/auth/me");

          // 401 significa que no hay sesion o que el token no sirve.
          if (res.status === 401) {
            // Sesión inválida o inexistente: no reintentar.
            // Si el provider sigue montado, limpia usuario y termina carga.
            if (activo) { setUser(null); setCargando(false); }
            return;
          }

          // 503 suele indicar que la base de datos no respondio a tiempo.
          if (res.status === 503) {
            // Neon cold start. Backoff corto y reintentar.
            // Si quedan intentos, espera un poco mas cada vez.
            if (intento < 2) {
              await new Promise(r => setTimeout(r, 1000 * (intento + 1)));
              continue;
            }
            // Reintentos agotados: se deja usuario en null y cargando en false
            // para no colgar el AuthGate indefinidamente.
            // Evita que la pantalla quede eternamente en "Cargando".
            if (activo) { setUser(null); setCargando(false); }
            return;
          }

          // Cualquier respuesta no exitosa distinta a 401/503 se trata como sin sesion.
          if (!res.ok) {
            // 4xx/5xx no clasificados: sin sesión, sin reintento.
            if (activo) { setUser(null); setCargando(false); }
            return;
          }

          // Lee el JSON del endpoint /api/auth/me.
          const data = await res.json();
          // Actualiza estado solo si el componente sigue vivo.
          if (activo) {
            // Si el backend confirma sesion, guarda el usuario.
            if (data.ok) setUser(data.user);
            // Termina el estado de carga.
            setCargando(false);
          }
          return;
        } catch {
          // Fallo de red (fetch lanza). Backoff y reintentar; si es el último
          // intento, se cierra la carga sin usuario.
          // Si no es el ultimo intento, espera y vuelve a probar.
          if (intento < 2) {
            await new Promise(r => setTimeout(r, 1000 * (intento + 1)));
            continue;
          }
          // Si ya fallo tres veces, se deja la app sin usuario.
          if (activo) { setUser(null); setCargando(false); }
          return;
        }
      }
    }

    // Ejecuta la hidratacion de sesion.
    hidratar();
    // Cleanup: evita setState cuando el provider ya no existe.
    return () => { activo = false; };
  }, []);

  // Estable para que los efectos que lo referencian no re-suscriban en cada render.
  // useCallback mantiene la misma referencia de logout entre renders.
  const logout = useCallback(async () => {
    // Llama al endpoint de logout incluyendo CSRF porque es POST.
    await fetchSeguro("/api/auth/logout", { method: "POST" });
    // Borra el usuario del estado local.
    setUser(null);
    // Asegura que AuthGate no siga mostrando "Cargando".
    setCargando(false);
  }, []);

  // Cualquier 401 en cualquier fetch (clienteFetch lo detecta) dispara este
  // evento. Un solo lugar cierra sesión; el AuthGate, al ver user=null,
  // renderiza LoginPage sin router.replace explícito.
  // Este efecto escucha expiraciones detectadas por la capa de fetch/live.
  useEffect(() => {
    // Handler que cierra sesion cuando llega el evento global.
    const onExpira = () => { void logout(); };
    // Registra el listener en window.
    window.addEventListener("sesion-expirada", onExpira);
    // Limpia el listener al desmontar o cambiar logout.
    return () => window.removeEventListener("sesion-expirada", onExpira);
  }, [logout]);

  // Efecto de cierre automatico por inactividad, solo para clientes.
  useEffect(() => {
    // Si no hay usuario cliente, no instala temporizadores.
    if (user?.role !== "cliente") return;

    // Minutos permitidos sin actividad antes de cerrar sesion.
    const MINUTOS = 15;
    // Conversion a milisegundos para setTimeout.
    const MS = MINUTOS * 60 * 1000;
    // Referencia al temporizador activo.
    let timer: ReturnType<typeof setTimeout>;

    // Funcion que se ejecuta cuando vence el tiempo de inactividad.
    const cerrarPorInactividad = async () => {
      // Cierra la sesion real y limpia estado.
      await logout();
      // Informa al usuario por que fue expulsado.
      alertaAdvertencia(
        `Tu sesión se cerró por inactividad (${MINUTOS} minutos).`,
        "Sesión expirada"
      );
    };

    // Reinicia el temporizador cada vez que el usuario interactua.
    const reiniciar = () => {
      // Borra el timeout anterior.
      clearTimeout(timer);
      // Programa un nuevo cierre para dentro de 15 minutos.
      timer = setTimeout(cerrarPorInactividad, MS);
    };

    // Eventos considerados actividad del usuario.
    const eventos: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    // Registra todos los eventos con listener pasivo.
    eventos.forEach(e => window.addEventListener(e, reiniciar, { passive: true }));
    // Inicia el primer temporizador inmediatamente.
    reiniciar();

    // Cleanup: elimina temporizador y listeners.
    return () => {
      clearTimeout(timer);
      eventos.forEach(e => window.removeEventListener(e, reiniciar));
    };
  }, [user, logout]);

  // Funcion publica de login que consume LoginPage.
  const login = async (doc: string, password: string) => {
    try {
      // Envia documento y contrasena al endpoint de autenticacion.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        // Indica que el cuerpo se envia como JSON.
        headers: { "Content-Type": "application/json" },
        // Convierte credenciales a texto JSON.
        body: JSON.stringify({ doc, password }),
      });

      // Intenta leer JSON; si falla, devuelve null.
      const data = await res.json().catch(() => null);

      // Si el servidor no devolvio JSON valido, reporta error controlado.
      if (!data) {
        return { ok: false, error: "El servidor no devolvió una respuesta válida." };
      }

      // Si HTTP fallo o el payload trae ok false, devuelve el mensaje del backend.
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || "No se pudo iniciar sesión." };
      }

      // Guarda el usuario recibido para que AuthGate muestre la app privada.
      setUser(data.user);
      // Termina cualquier estado de carga pendiente.
      setCargando(false);
      // Informa exito al componente que llamo login.
      return { ok: true, error: "" };
    } catch {
      // Si fetch lanza por red/servidor inaccesible, termina carga.
      setCargando(false);
      // Devuelve error amigable para el formulario.
      return { ok: false, error: "Error de conexión. Intenta de nuevo." };
    }
  };

  // Expone el estado y funciones a todos los componentes hijos.
  return (
    <AuthContext.Provider value={{ user, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook auxiliar para consumir AuthContext sin importar useContext en cada componente.
export function useAuth() {
  // Devuelve user, cargando, login y logout.
  return useContext(AuthContext);
}
