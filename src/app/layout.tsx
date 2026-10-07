import type { Metadata } from "next";
import "../styles/globals.css";
import { ToastProvider } from "@/components/core/Toast";

export const metadata: Metadata = {
  title: "CompraMais",
  description: "Cada pedido completa a receita.",
  icons: { icon: "/brand/icone-app.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
