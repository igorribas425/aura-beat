import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const configPath = path.join(process.cwd(), "play-store", "app.config.json");

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

let baseConfig = {};
if (fs.existsSync(configPath)) {
  baseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
}

const host = normalizeHost(readFlag("--host") || baseConfig.host || "");
const sha256 = readFlag("--sha256").trim().toUpperCase();

if (!host) {
  fail(
    "host nao configurado. Defina em play-store/app.config.json ou use --host.",
  );
}

if (sha256 && !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(sha256)) {
  fail("SHA-256 invalido. Use o fingerprint completo separado por dois-pontos.");
}

const outputDir = path.join(process.cwd(), "play-store", "generated");
fs.mkdirSync(outputDir, { recursive: true });

const packageId = baseConfig.packageId || "com.aurabeat.app";
const startUrl = baseConfig.startUrl || "/abrir";

const twaManifest = {
  packageId,
  host,
  name: baseConfig.name || "Aura Beat",
  launcherName: baseConfig.name || "Aura Beat",
  display: "standalone",
  startUrl,
  themeColor: baseConfig.themeColor || "#050507",
  backgroundColor: baseConfig.backgroundColor || "#050507",
  navigationColor: baseConfig.navigationColor || "#050507",
  orientation: baseConfig.orientation || "portrait-primary",
  iconUrl: `https://${host}/icons/icon-512.png`,
  maskableIconUrl: `https://${host}/icons/icon-maskable-512.png`,
};

fs.writeFileSync(
  path.join(outputDir, "twa-manifest.json"),
  JSON.stringify(twaManifest, null, 2) + "\n",
);

console.log("TWA preparado para:", `https://${host}`);
console.log("Package ID:", twaManifest.packageId);
console.log("Start URL:", twaManifest.startUrl);
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
