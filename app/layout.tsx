// Importa el proveedor global de autenticacion.
// Este componente comparte usuario, login, logout y estado de carga con toda la app.
import { AuthProvider } from "@/lib/auth";

// Importa la compuerta visual que decide si mostrar login o la aplicacion interna.
import AuthGate from "@/components/AuthGate";

// Carga los estilos globales de toda la aplicacion.
import "./globals.css";

// RootLayout es el layout raiz de Next.js.
// Todo lo que este dentro de app/ se renderiza dentro de este componente.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Devuelve la estructura HTML base compartida por todas las paginas.
  return (
    // Define el idioma principal del documento como espanol.
    <html lang="es">
      {/* Head contiene metadatos del documento HTML. */}
      <head>
        {/* Titulo que aparece en la pestana del navegador. */}
        <title>La Pradera — Parqueadero</title>
      </head>
      {/* Body contiene la aplicacion visible. */}
      <body>
        {/* AuthProvider monta el contexto de sesion para todos los hijos. */}
        <AuthProvider>
          {/* AuthGate decide si se ve login, cargando o la app protegida. */}
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
