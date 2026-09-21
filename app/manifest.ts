import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aura Beat — Marketplace de música",
    short_name: "Aura Beat",
    description: "Conectando talentos aos melhores eventos.",
    id: "/",
    start_url: "/",
    scope: "/",
    lang: "pt-BR",
    display: "standalone",
    categories: ["music", "business", "social"],
    background_color: "#050507",
    theme_color: "#050507",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
