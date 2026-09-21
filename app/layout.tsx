import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "../components/app-shell";
import { ServiceWorkerRegister } from "../components/service-worker-register";

export const metadata: Metadata = {
  title: { default: "Aura Beat", template: "%s | Aura Beat" },
  description: "Conectando talentos aos melhores eventos.",
  applicationName: "Aura Beat",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Aura Beat",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#050507" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ServiceWorkerRegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
