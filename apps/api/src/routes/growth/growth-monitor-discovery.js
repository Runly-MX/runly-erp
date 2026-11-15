const MAX_PATH_PROBES = 12;
const PATH_TIMEOUT_MS = 3000;

const GENERIC_PATHS = ["/health", "/api/health", "/healthz", "/login", "/my-account", "/account/login"];
// Single-page apps answer 200 + HTML on any path, so API-like paths must not be HTML.
const API_PATHS = new Set(["/health", "/api/health", "/healthz", "/wp-json", "/products.json"]);
const PLATFORM_PATHS = {
  shopify: ["/products.json", "/cart"],
  woocommerce: ["/wp-json", "/cart"],
  wordpress: ["/wp-json"],
};

export function detectPlatform(headers = {}, html = "") {
  const powered = String(headers["x-powered-by"] ?? "").toLowerCase();
  if (headers["x-shopid"] || /cdn\.shopify\.com/i.test(html)) return "shopify";
  if (/woocommerce/i.test(html)) return "woocommerce";
  if (/wp-content|wp-includes/i.test(html)) return "wordpress";
  if (headers["x-wix-request-id"] || /wixstatic\.com/i.test(html)) return "wix";
  if (/tiendanube|nuvemshop/i.test(html)) return "tiendanube";
  if (/squarespace/i.test(html)) return "squarespace";
  if (powered.includes("next") || /\/_next\//.test(html)) return "nextjs";
  return "generic";
}

export const PLATFORM_LABEL = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  wordpress: "WordPress",
  wix: "Wix",
  tiendanube: "Tiendanube",
  squarespace: "Squarespace",
  nextjs: "Next.js",
  generic: "Sitio generico",
};

// Maps an answered path to the monitor worth suggesting for it.
function suggestionForPath(origin, path, host) {
  const url = `${origin}${path}`;
  if (path === "/health" || path === "/api/health" || path === "/healthz") {
    return { type: "api", name: `${host} - estado del servidor`, config: { url, method: "GET", expectedMin: 200, expectedMax: 299 }, reason: `El sitio expone la ruta de salud ${path}.` };
  }
  if (path === "/wp-json") return { type: "api", name: `${host} - API de WordPress`, config: { url, method: "GET", expectedMin: 200, expectedMax: 299 }, reason: "API REST de WordPress activa." };
  if (path === "/products.json") return { type: "api", name: `${host} - catalogo de productos`, config: { url, method: "GET", expectedMin: 200, expectedMax: 299 }, reason: "Catalogo publico de la tienda." };
  if (path === "/cart") return { type: "http", name: `${host} - carrito`, config: { url, method: "GET" }, reason: "La pagina del carrito responde." };
  return { type: "http", name: `${host} - pagina de acceso`, config: { url, method: "GET" }, reason: `La pagina de acceso ${path} carga.` };
}

export function createGrowthMonitorDiscovery({ probes }) {
  async function discover(rawUrl) {
    let origin;
    let host;
    try {
      const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
      origin = url.origin;
      host = url.hostname;
    } catch {
      return { ok: false, error: "La URL no es valida." };
    }
    const home = await probes.probeHttp({ url: `${origin}/`, readBody: true, timeoutMs: 8000 });
    if (home.error) return { ok: false, error: home.error };

    const platform = detectPlatform(home.headers ?? {}, home.body ?? "");
    const suggestions = [
      { type: "http", name: `${host} - disponibilidad`, config: { url: `${origin}/`, method: "GET" }, reason: "La pagina principal responde." },
    ];
    if (origin.startsWith("https://")) {
      suggestions.push({ type: "ssl", name: `${host} - certificado SSL`, config: { host, port: 443, warnDays: 14 }, reason: "Aviso antes de que venza el certificado." });
    }

    if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      suggestions.push({ type: "domain", name: `${host} - vencimiento del dominio`, config: { host, warnDays: 30 }, intervalSeconds: 86400, reason: "Aviso antes de que venza el registro del dominio." });
    }

    const paths = [...new Set([...(PLATFORM_PATHS[platform] ?? []), ...GENERIC_PATHS])].slice(0, MAX_PATH_PROBES);
    for (const path of paths) {
      const result = await probes.probeHttp({ url: `${origin}${path}`, timeoutMs: PATH_TIMEOUT_MS });
      const isHtml = /html/i.test(String(result.headers?.["content-type"] ?? ""));
      if (!result.error && result.statusCode >= 200 && result.statusCode < 300 && !(API_PATHS.has(path) && isHtml)) {
        suggestions.push(suggestionForPath(origin, path, host));
      }
    }
    return { ok: true, platform, platformLabel: PLATFORM_LABEL[platform], suggestions };
  }

  return { discover };
}
