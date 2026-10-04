// Política de tratamiento de datos personales. Obligación Ley 1581 de 2012
// (Colombia). Página pública: se renderiza sin sesión, sin sidebar y sin
// campana, incluso si hay un usuario autenticado (ver AuthGate). Server
// Component: sin "use client" ni hooks, la fecha se hornea en build.
import Link from "next/link";
import { C } from "@/lib/tema";
import { Tarjeta } from "@/lib/componentes";

const parrafo: React.CSSProperties = {
  color: C.text,
  fontSize: 14,
  lineHeight: 1.65,
  marginBottom: 10,
};

const lista: React.CSSProperties = {
  color: C.text,
  fontSize: 14,
  lineHeight: 1.65,
  paddingLeft: 22,
  marginBottom: 10,
};

export default function PrivacidadPage() {
  return (
    <div style={{ minHeight: "100vh", padding: "32px 20px 60px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            color: C.accent,
            fontSize: 13,
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 18,
          }}
        >
          ← Volver
        </Link>

        <Tarjeta>
          <h1
            style={{
              fontFamily: "Syne",
              fontWeight: 800,
              fontSize: 24,
              marginBottom: 6,
            }}
          >
            Política de tratamiento de datos personales
          </h1>
          <p style={{ color: C.sub, fontSize: 12, marginBottom: 22 }}>
            Última actualización: {new Date().toISOString().slice(0, 10)}
          </p>

          <Seccion titulo="1. Responsable del tratamiento">
            <p style={parrafo}>
              Parqueadero La Pradera, con NIT [●] y domicilio en [●], es el
              responsable del tratamiento de los datos personales que usted
              entrega a través de esta plataforma, conforme a la Ley 1581 de
              2012 y al Decreto 1377 de 2013 de la República de Colombia.
            </p>
          </Seccion>

          <Seccion titulo="2. Finalidad del tratamiento">
            <p style={parrafo}>Los datos recolectados se utilizan para:</p>
            <ul style={lista}>
              <li>Registrar el ingreso y la salida de vehículos del parqueadero.</li>
              <li>Facturar y gestionar el cobro del servicio.</li>
              <li>Suscribir y administrar contratos de parqueo mensual.</li>
              <li>
                Contactar al propietario ante novedades del vehículo, pagos
                pendientes o vencimiento de contrato.
              </li>
              <li>Cumplir obligaciones contables, tributarias y legales.</li>
            </ul>
          </Seccion>

          <Seccion titulo="3. Datos recolectados">
            <p style={parrafo}>
              Documento de identidad, nombre completo, teléfono, correo
              electrónico y los datos del vehículo registrado (placa, tipo,
              clase y color).
            </p>
          </Seccion>

          <Seccion titulo="4. Derechos del titular">
            <p style={parrafo}>Conforme a la ley, usted puede:</p>
            <ul style={lista}>
              <li>Conocer, actualizar y rectificar sus datos.</li>
              <li>Solicitar prueba de la autorización otorgada.</li>
              <li>Ser informado sobre el uso que se ha dado a sus datos.</li>
              <li>
                Presentar quejas ante la Superintendencia de Industria y
                Comercio.
              </li>
              <li>
                Revocar la autorización y solicitar la supresión de sus datos
                cuando no exista un deber legal o contractual que lo impida.
              </li>
            </ul>
          </Seccion>

          <Seccion titulo="5. Cómo ejercer sus derechos">
            <p style={parrafo}>
              Envíe su solicitud a [correo de contacto] indicando nombre,
              documento de identidad y la petición concreta. La respuesta se
              emite dentro de los términos legales vigentes.
            </p>
          </Seccion>

          <Seccion titulo="6. Cookies">
            <p style={parrafo}>
              La plataforma utiliza únicamente dos cookies técnicas, necesarias
              para su funcionamiento:
            </p>
            <ul style={lista}>
              <li>
                <b>token</b>: identifica su sesión autenticada. Es httpOnly,
                dura 8 horas y se elimina al cerrar sesión.
              </li>
              <li>
                <b>csrf</b>: protege contra ataques de falsificación de
                peticiones. Dura 8 horas.
              </li>
            </ul>
            <p style={parrafo}>
              Ninguna se utiliza con fines publicitarios, de perfilamiento o
              analítica, y no se comparten con terceros.
            </p>
          </Seccion>

          <Seccion titulo="7. Conservación de los datos">
            <p style={parrafo}>
              Los datos se conservan mientras exista relación contractual con
              el parqueadero y durante el término que exijan las obligaciones
              contables y legales aplicables. Cumplido ese plazo, se eliminan
              de forma segura.
            </p>
          </Seccion>

          <Seccion titulo="8. Seguridad">
            <p style={parrafo}>
              Aplicamos medidas técnicas y administrativas razonables para
              proteger la información: cifrado en tránsito (HTTPS), contraseñas
              almacenadas como hash, control de acceso por rol y registro de
              auditoría de las operaciones sensibles.
            </p>
          </Seccion>

          <Seccion titulo="9. Vigencia">
            <p style={parrafo}>
              Esta política rige desde su publicación. Cualquier cambio
              sustancial se notificará en esta misma plataforma.
            </p>
          </Seccion>
        </Tarjeta>
      </div>
    </div>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2
        style={{
          fontFamily: "Syne",
          fontWeight: 700,
          fontSize: 15,
          marginBottom: 8,
        }}
      >
        {titulo}
      </h2>
      {children}
    </section>
  );
}
