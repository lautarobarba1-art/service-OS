import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ServiceOS",
  description: "Operaciones claras para negocios de servicios.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
