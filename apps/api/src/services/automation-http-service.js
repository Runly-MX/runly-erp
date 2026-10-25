// Outgoing HTTP step of Builder automations (stage C, C2). The generated module
// code never touches the network: it asks the host for a call and this service
// enforces the rules. Spec
// docs/superpowers/specs/2026-10-25-automation-studio-v2-stage-c-reach-design.md.
//
// Rules: https only, default port, no credentials in the URL, host in the
// administrator's allow-list, every resolved address must be public (checked
// at connect time, so DNS rebinding cannot swap it afterwards), redirects are
// not followed, 10 s timeout, 64 KB request body, body signed with HMAC-SHA256.
import crypto from "node:crypto";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";

export const HOSTS_KEY = "automation_http_hosts";
export const SECRET_KEY = "automation_http_secret";
const MAX_HOSTS = 50;
const MAX_BODY_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export class AutomationHttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AutomationHttpError";
    this.status = status;
  }
}

const blocked = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["64:ff9b::", 96]]) blocked.addSubnet(address, prefix, "ipv6");

// True when the address is a public, routable one.
export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (!family) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  return !blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

function defaultTransport({ host, path, method, headers, body, lookup }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path, method, headers, lookup, timeout: TIMEOUT_MS, servername: host }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size <= 200) chunks.push(chunk);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new AutomationHttpError("La llamada tardó más de 10 segundos.", 504)));
    req.on("error", reject);
    req.end(body);
  });
}

export function createAutomationHttpService({ prisma, transport = defaultTransport, resolveHost = dns.promises.lookup }) {
  async function readConfig(key) {
    const row = await prisma.instanceConfig.findUnique({ where: { key }, select: { value: true } });
    return row?.value ?? null;
  }
  async function writeConfig(key, value) {
    await prisma.instanceConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  async function getHosts() {
    try {
      const parsed = JSON.parse((await readConfig(HOSTS_KEY)) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  async function setHosts(hosts) {
    const clean = [...new Set((Array.isArray(hosts) ? hosts : []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
    if (clean.length > MAX_HOSTS) throw new AutomationHttpError(`Máximo ${MAX_HOSTS} destinos.`);
    const invalid = clean.find((host) => !HOST_RE.test(host) || net.isIP(host));
    if (invalid) throw new AutomationHttpError(`"${invalid}" no es un nombre de host válido (sin https://, ruta ni puerto).`);
    await writeConfig(HOSTS_KEY, JSON.stringify(clean));
    return clean;
  }

  async function getSecret({ create = true } = {}) {
    const existing = await readConfig(SECRET_KEY);
    if (existing || !create) return existing;
    const secret = crypto.randomBytes(32).toString("hex");
    await writeConfig(SECRET_KEY, secret);
    return secret;
  }

  // lookup() handed to https.request: resolves, rejects non-public addresses
  // and connects only to a validated one.
  function safeLookup(hostname, options, callback) {
    resolveHost(hostname, { all: true, verbatim: true }).then((addresses) => {
      const list = Array.isArray(addresses) ? addresses : [addresses];
      if (!list.length || !list.every((item) => isPublicAddress(item.address))) {
        callback(new AutomationHttpError("El destino resuelve a una dirección no pública; no se permite.", 403));
        return;
      }
      if (options?.all) callback(null, list.map((item) => ({ address: item.address, family: item.family })));
      else callback(null, list[0].address, list[0].family);
    }, callback);
  }

  async function send({ companyId, moduleKey, request }) {
    let url;
    try { url = new URL(String(request?.url ?? "")); } catch { throw new AutomationHttpError("La dirección de la llamada no es válida."); }
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new AutomationHttpError("Solo se permiten direcciones https sin credenciales ni puerto.");
    const method = String(request.method ?? "POST").toUpperCase();
    if (!["POST", "PUT", "PATCH"].includes(method)) throw new AutomationHttpError("Método no permitido.");
    const host = url.hostname.toLowerCase();
    if (!(await getHosts()).includes(host)) {
      throw new AutomationHttpError(`El destino "${host}" no está en la lista de destinos permitidos. Pide a un administrador que lo agregue.`, 403);
    }
    const body = JSON.stringify({
      module: moduleKey, automation: request.automationKey ?? null, companyId, idempotencyKey: request.idempotencyKey ?? null, data: request.body ?? {},
    });
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new AutomationHttpError("El cuerpo de la llamada supera 64 KB.", 413);
    const secret = await getSecret();
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const response = await transport({
      host, path: `${url.pathname}${url.search}`, method, body, lookup: safeLookup,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "Runly-Automations/1",
        "X-Runly-Idempotency-Key": request.idempotencyKey ?? "",
        "X-Runly-Signature": `sha256=${signature}`,
      },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new AutomationHttpError(`${host} respondió ${response.status}${response.text ? `: ${response.text.slice(0, 200)}` : ""}`, 502);
    }
    return { status: response.status };
  }

  return { getHosts, setHosts, getSecret, send, safeLookup };
}
