// Marca el componente como cliente porque usa estado, router y eventos del navegador.
"use client";

// useState permite guardar lo que el usuario escribe y los errores del formulario.
import { useState } from "react";

// useRouter permite redirigir despues de iniciar sesion.
import { useRouter } from "next/navigation";

// useAuth entrega la funcion login desde el contexto global de autenticacion.
import { useAuth } from "@/lib/auth";

// C contiene colores compartidos por toda la interfaz.
import { C } from "@/lib/tema";

// Tarjeta y FilaFormulario son componentes visuales reutilizables del proyecto.
import { Tarjeta, FilaFormulario } from "@/lib/componentes";

// Muestra una alerta visual cuando se supera el limite de intentos.
import { alertaAdvertencia } from "@/lib/alerta";

// Valida que el documento tenga el formato esperado.
import { esDocumentoValido } from "@/lib/validacion";

// Pantalla publica de inicio de sesion.
export default function LoginPage() {
  // Extrae la funcion login del contexto de autenticacion.
  const { login } = useAuth();
  // Crea el router para poder cambiar de pagina sin recargar.
  const router = useRouter();
  // Documento escrito por el usuario.
  const [doc, setDoc] = useState("");
  // Contrasena escrita por el usuario.
  const [pwd, setPwd] = useState("");
  // Mensaje de error visible debajo de los campos.
  const [err, setErr] = useState("");
  // Contador local de intentos fallidos en este navegador.
  const [tries, setTries] = useState(0);

  // Funcion ejecutada al presionar Ingresar o Enter en la contrasena.
  const submit = async () => {
    // Bloquea el formulario despues de diez intentos locales.
    if (tries >= 10) {
      // Actualiza el error textual del formulario.
      setErr("Límite de intentos alcanzado (10/10).");
      // Muestra una alerta mas visible usando SweetAlert2.
      alertaAdvertencia("Has superado el número máximo de intentos (10/10).");
      // Detiene el flujo para no llamar al servidor.
      return;
    }

    // Valida documento antes de pedir login al backend.
    if (!esDocumentoValido(doc)) {
      // Informa el formato esperado.
      setErr("Documento inválido (6 a 12 dígitos)");
      return;
    }
    // Evita enviar una contrasena vacia.
    if (!pwd) {
      setErr("La contraseña es obligatoria");
      return;
    }

    // Llama al login real del contexto, que a su vez consulta /api/auth/login.
    const result = await login(doc, pwd);

    // Si el backend rechazo credenciales o hubo error, se incrementan intentos.
    if (!result.ok) {
      setTries((t) => t + 1);
      // Usa tries + 1 porque el estado todavia no se actualiza en esta misma linea.
      setErr(`Credenciales incorrectas. Intento ${tries + 1}/10`);
      return;
    }

    // Consulta la sesion ya creada para decidir a que pantalla enviar al usuario.
    const me = await fetch("/api/auth/me").then(r => r.json());
    // Los clientes entran directamente a su perfil.
    if (me.ok && me.user?.role === "cliente") {
      router.replace("/perfil");
    } else {
      // Gerentes y empleados entran al dashboard principal.
      router.replace("/");
    }
  };

  // Renderiza el fondo centrado del login.
  return (
    <div style={{
      // Ocupa toda la pantalla y centra la tarjeta de login.
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      // Fondo oscuro con dos luces radiales suaves.
      background: `radial-gradient(ellipse at 20% 50%,#1E3A5F22 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,#3B82F611 0%,transparent 50%),${C.bg}`,
    }}>
      {/* Contenedor con ancho maximo para que el login no se estire demasiado. */}
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Encabezado visual de marca. */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            // Icono cuadrado del parqueadero.
            width: 72, height: 72, borderRadius: 20,
            // Degradado de marca.
            background: `linear-gradient(135deg,${C.accent},${C.accent2})`,
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 30,
          }}>🅿</div>
          {/* Nombre del parqueadero. */}
          <h1 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 28, letterSpacing: -1 }}>La Pradera</h1>
          {/* Descripcion corta del sistema. */}
          <p style={{ color: C.sub, fontSize: 14, marginTop: 4 }}>Sistema de Gestión de Parqueadero</p>
        </div>

        {/* Tarjeta principal del formulario. */}
        <Tarjeta>
          {/* Titulo del formulario. */}
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Iniciar Sesión</h2>
          {/* Texto auxiliar que explica los datos requeridos. */}
          <p style={{ color: C.sub, fontSize: 13, marginBottom: 24 }}>Ingresa con tu número de documento y contraseña</p>

          {/* data-form-nav probablemente se usa para navegacion automatica entre campos. */}
          <div data-form-nav>
            {/* Campo del documento del usuario. */}
            <FilaFormulario label="Número de Documento">
              {/* input controlado: su valor vive en el estado doc. */}
              <input value={doc} onChange={e => setDoc(e.target.value)} placeholder="Ej: 1122338718" maxLength={12} />
            </FilaFormulario>
            {/* Campo de contrasena. */}
            <FilaFormulario label="Contraseña">
              {/* Al presionar Enter tambien se ejecuta submit. */}
              <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()} />
            </FilaFormulario>

            {/* Renderiza el error solo si existe texto en err. */}
            {err && (
              <p style={{
                // Caja roja suave para errores de validacion o credenciales.
                color: C.red, fontSize: 13, marginBottom: 12, background: "#EF444411",
                padding: "8px 12px", borderRadius: 8,
              }}>{err}</p>
            )}

            {/* Boton principal para enviar credenciales. */}
            <button
              type="button"
              // Marca usada por alguna logica de navegacion/formulario.
              data-nav-submit
              // Ejecuta la funcion submit al hacer clic.
              onClick={submit}
              style={{
                // Estilos de boton ancho y destacado.
                width: "100%", marginTop: 4, padding: "10px 20px", borderRadius: 8, border: "none",
                fontWeight: 600, fontSize: 14, cursor: "pointer",
                background: `linear-gradient(135deg,${C.accent},${C.accent2})`, color: "#fff",
              }}
            >Ingresar</button>
          </div>

          {/* Bloque informativo con credenciales demo visibles en desarrollo. */}
          <div style={{
            marginTop: 20, padding: "12px 16px", background: C.surface,
            borderRadius: 10, fontSize: 12, color: C.sub,
          }}>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Cuentas de prueba:</p>
            <p>🔴 Gerente: <b>1122338718</b> / 123</p>
            <p>🔵 Empleado: <b>124</b> / 124</p>
            <p>🔵 Empleado: <b>123</b> / 123</p>
            <p>🟢 Cliente: <b>1234</b> / 1234</p>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
