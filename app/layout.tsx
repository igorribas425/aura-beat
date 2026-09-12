import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "../components/app-shell";

export const metadata: Metadata = {
  title: { default: "Aura Beat", template: "%s | Aura Beat" },
  description: "Conectando talentos aos melhores eventos.",
  applicationName: "Aura Beat",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#050507", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className="h-full antialiased"><body className="flex min-h-full flex-col"><AppShell>{children}</AppShell></body></html>;
}
