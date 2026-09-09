import { AuthProvider } from "@/lib/auth";
import AuthGate from "@/components/AuthGate";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <title>La Pradera — Parqueadero</title>
      </head>
      <body>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
