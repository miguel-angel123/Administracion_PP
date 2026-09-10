"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/tema";
import { Tarjeta, FilaFormulario } from "@/lib/componentes";
import { alertaAdvertencia } from "@/lib/alerta";
import { esDocumentoValido } from "@/lib/validacion";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [doc, setDoc] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [tries, setTries] = useState(0);

  const submit = async () => {
    if (tries >= 10) {
      setErr("Límite de intentos alcanzado (10/10).");
      alertaAdvertencia("Has superado el número máximo de intentos (10/10).");
      return;
    }

    if (!esDocumentoValido(doc)) {
      setErr("Documento inválido (6 a 12 dígitos)");
      return;
    }
    if (!pwd) {
      setErr("La contraseña es obligatoria");
      return;
    }

    const result = await login(doc, pwd);

    if (!result.ok) {
      setTries((t) => t + 1);
      setErr(`Credenciales incorrectas. Intento ${tries + 1}/10`);
      return;
    }

    const me = await fetch("/api/auth/me").then(r => r.json());
    if (me.ok && me.user?.role === "cliente") {
      router.replace("/perfil");
    } else {
      router.replace("/");
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      background: `radial-gradient(ellipse at 20% 50%,#1E3A5F22 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,#3B82F611 0%,transparent 50%),${C.bg}`,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: `linear-gradient(135deg,${C.accent},${C.accent2})`,
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 30,
          }}>🅿</div>
          <h1 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 28, letterSpacing: -1 }}>La Pradera</h1>
          <p style={{ color: C.sub, fontSize: 14, marginTop: 4 }}>Sistema de Gestión de Parqueadero</p>
        </div>

        <Tarjeta>
          <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Iniciar Sesión</h2>
          <p style={{ color: C.sub, fontSize: 13, marginBottom: 24 }}>Ingresa con tu número de documento y contraseña</p>

          <div data-form-nav>
            <FilaFormulario label="Número de Documento">
              <input value={doc} onChange={e => setDoc(e.target.value)} placeholder="Ej: 1122338718" maxLength={12} />
            </FilaFormulario>
            <FilaFormulario label="Contraseña">
              <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()} />
            </FilaFormulario>

            {err && (
              <p style={{
                color: C.red, fontSize: 13, marginBottom: 12, background: "#EF444411",
                padding: "8px 12px", borderRadius: 8,
              }}>{err}</p>
            )}

            <button
              type="button"
              data-nav-submit
              onClick={submit}
              style={{
                width: "100%", marginTop: 4, padding: "10px 20px", borderRadius: 8, border: "none",
                fontWeight: 600, fontSize: 14, cursor: "pointer",
                background: `linear-gradient(135deg,${C.accent},${C.accent2})`, color: "#fff",
              }}
            >Ingresar</button>
          </div>

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
