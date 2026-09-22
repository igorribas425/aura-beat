import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function readFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] || "";
}

function fail(message) {
  console.error("Aura Beat Play Store:", message);
  process.exit(1);
}

function normalizeHost(value) {
  if (!value) return "";
  const candidate = value.includes("://") ? value : `https://${value}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    fail("host invalido.");
  }

  if (url.protocol !== "https:") {
    fail("o app exige um host HTTPS.");
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    fail("informe apenas o dominio/host, sem caminho, query ou hash.");
  }

  return url.host;
}

const host = normalizeHost(readFlag("--host"));
const sha256 = readFlag("--sha256").trim().toUpperCase();

if (!host) {
  fail(
    "informe o host. Exemplo: npm run play:prepare -- --host aura-beat.vercel.app",
  );
}

if (sha256 && !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(sha256)) {
  fail("SHA-256 invalido. Use o fingerprint completo separado por dois-pontos.");
}

const outputDir = path.join(process.cwd(), "play-store", "generated");
fs.mkdirSync(outputDir, { recursive: true });

const twaManifest = {
  packageId: "com.aurabeat.app",
  host,
  name: "Aura Beat",
  launcherName: "Aura Beat",
  display: "standalone",
  startUrl: "/abrir",
  themeColor: "#050507",
  backgroundColor: "#050507",
  navigationColor: "#050507",
  orientation: "portrait-primary",
  iconUrl: `https://${host}/icons/icon-512.png`,
  maskableIconUrl: `https://${host}/icons/icon-maskable-512.png`,
};

fs.writeFileSync(
  path.join(outputDir, "twa-manifest.json"),
  JSON.stringify(twaManifest, null, 2) + "\n",
);

console.log("TWA preparado para:", `https://${host}`);
console.log("Package ID:", twaManifest.packageId);
console.log("Arquivo:", "play-store/generated/twa-manifest.json");

if (sha256) {
  const assetLinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: twaManifest.packageId,
        sha256_cert_fingerprints: [sha256],
      },
    },
  ];

  fs.writeFileSync(
    path.join(outputDir, "assetlinks.json"),
    JSON.stringify(assetLinks, null, 2) + "\n",
  );

  console.log("Asset Links preparado:", "play-store/generated/assetlinks.json");
  console.log(
    "Depois de revisar, publique esse conteudo em /.well-known/assetlinks.json no host de producao.",
  );
} else {
  console.log(
    "SHA-256 ainda nao informado. O assetlinks.json sera gerado somente depois de existir a chave de assinatura.",
  );
}
