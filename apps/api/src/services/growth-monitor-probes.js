import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

import { isPublicAddress } from "./automation-http-service.js";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const IANA_RDAP_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";

export class MonitorProbeError extends Error {}

const NETWORK_ERRORS = {
  ENOTFOUND: "El dominio no existe o no resuelve.",
  EAI_AGAIN: "No se pudo consultar el DNS del dominio.",
  ECONNREFUSED: "Conexion rechazada por el servidor.",
  ECONNRESET: "El servidor cerro la conexion.",
  ETIMEDOUT: "Tiempo de espera agotado.",
};
export const describeNetworkError = (error) => NETWORK_ERRORS[error?.code] ?? error?.message ?? String(error);

const GENERIC_SECOND_LEVEL = new Set(["com", "net", "org", "gob", "edu", "gov", "co", "ac"]);
// Reduces a hostname to the registrable domain RDAP expects (best effort, no public suffix list).
export function registrableDomain(host) {
  const labels = String(host).toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  return labels.slice(tld.length === 2 && GENERIC_SECOND_LEVEL.has(second) ? -3 : -2).join(".");
}

// Custom headers (auth) are only sent to the host the user configured, never to a redirect target.
function sameOrigin(current, raw) {
  return new URL(raw).host === current.host;
}

// Resolve first, refuse non-public addresses, then pin the connection to the
// vetted IP so a second DNS answer (rebinding) cannot redirect the request.
// allowPrivate is test-only and ignored when NODE_ENV=production.
async function resolvePinned(host, { resolveHost, allowPrivate }) {
  const addresses = await resolveHost(host, { all: true });
  const list = Array.isArray(addresses) ? addresses : [addresses];
  const allowed = allowPrivate && process.env.NODE_ENV !== "production";
  if (!list.length) throw new MonitorProbeError("El dominio no resuelve.");
  if (!allowed && list.some((entry) => !isPublicAddress(entry.address))) {
    throw new MonitorProbeError("El destino no es una direccion publica.");
  }
  return list[0];
}

function pinnedLookup(target) {
  return (_host, options, callback) => {
    if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
    else callback(null, target.address, target.family);
  };
}

const MAX_BODY_BYTES = 256 * 1024;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const FORBIDDEN_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding"]);

function safeHeaders(headers = {}) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) out[name] = String(value);
  }
  return out;
}

function defaultRequest({ url, method, timeoutMs, lookup, headers, body, readBody }) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const payload = body == null ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    if (payload && payload.length > MAX_REQUEST_BODY_BYTES) return reject(new MonitorProbeError("El cuerpo de la peticion es demasiado grande."));
    const req = client.request(url, {
      method, lookup, timeout: timeoutMs,
      headers: { "user-agent": "RunlyMonitor/1.0", ...(payload ? { "content-type": "application/json", "content-length": payload.length } : {}), ...safeHeaders(headers) },
    }, (res) => {
      const finish = (text) => resolve({ statusCode: res.statusCode ?? 0, location: res.headers.location ?? null, headers: res.headers, body: text });
      if (!readBody) { res.resume(); return finish(null); }
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        if (size >= MAX_BODY_BYTES) return;
        chunks.push(chunk);
        size += chunk.length;
        if (size >= MAX_BODY_BYTES) res.destroy();
      });
      res.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
      res.on("close", () => finish(Buffer.concat(chunks).toString("utf8")));
      res.on("error", () => finish(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("timeout", () => req.destroy(new MonitorProbeError("Tiempo de espera agotado.")));
    req.on("error", reject);
    req.end(payload);
  });
}

export function createGrowthMonitorProbes({
  resolveHost = dns.promises.lookup,
  request = defaultRequest,
  connectTls = tls.connect,
  resolveDns = (host, type) => dns.promises.resolve(host, type),
  rdapFetch = fetch,
  allowPrivate = process.env.RUNLY_GROWTH_MONITOR_ALLOW_PRIVATE === "true",
} = {}) {
  async function probeHttp({ url: rawUrl, method = "GET", timeoutMs = DEFAULT_TIMEOUT_MS, headers, body, readBody = false }) {
    const started = Date.now();
    let url;
    try {
      url = new URL(rawUrl);
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        if (!["http:", "https:"].includes(url.protocol)) throw new MonitorProbeError("Solo se permite http o https.");
        const target = await resolvePinned(url.hostname, { resolveHost, allowPrivate });
        const res = await request({ url, method, timeoutMs, lookup: pinnedLookup(target), headers: sameOrigin(url, rawUrl) ? headers : undefined, body: hop === 0 ? body : undefined, readBody });
        if (res.statusCode >= 300 && res.statusCode < 400 && res.location && hop < MAX_REDIRECTS) {
          url = new URL(res.location, url);
          continue;
        }
        return { statusCode: res.statusCode, latencyMs: Date.now() - started, error: null, body: res.body ?? null, headers: res.headers ?? null, finalUrl: url.href };
      }
      throw new MonitorProbeError("Demasiadas redirecciones.");
    } catch (error) {
      return { statusCode: null, latencyMs: Date.now() - started, error: describeNetworkError(error) };
    }
  }

  async function probeSsl({ host, port = 443, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    try {
      const target = await resolvePinned(host, { resolveHost, allowPrivate });
      return await new Promise((resolve) => {
        const socket = connectTls({ host: target.address, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
          const cert = socket.getPeerCertificate();
          const result = {
            authorized: socket.authorized,
            authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
            validTo: cert?.valid_to ? new Date(cert.valid_to).toISOString() : null,
            issuer: cert?.issuer?.O ?? cert?.issuer?.CN ?? null,
            error: null,
          };
          socket.end();
          resolve(result);
        });
        socket.on("timeout", () => { socket.destroy(); resolve({ error: "Tiempo de espera agotado." }); });
        socket.on("error", (error) => resolve({ error: error.message }));
      });
    } catch (error) {
      return { error: describeNetworkError(error) };
    }
  }

  async function probeTcp({ host, port, timeoutMs = 5000 }) {
    const started = Date.now();
    try {
      const target = await resolvePinned(host, { resolveHost, allowPrivate });
      return await new Promise((resolve) => {
        const socket = net.connect({ host: target.address, port, timeout: timeoutMs }, () => {
          socket.end();
          resolve({ connected: true, latencyMs: Date.now() - started, error: null });
        });
        socket.on("timeout", () => { socket.destroy(); resolve({ connected: false, error: NETWORK_ERRORS.ETIMEDOUT }); });
        socket.on("error", (error) => resolve({ connected: false, error: describeNetworkError(error) }));
      });
    } catch (error) {
      return { connected: false, error: describeNetworkError(error) };
    }
  }

  async function probeDns({ host, recordType = "A" }) {
    try {
      const records = await resolveDns(host, recordType);
      const values = records.map((r) => (typeof r === "string" ? r : Array.isArray(r) ? r.join("") : (r.exchange ?? JSON.stringify(r))));
      return { values, error: null };
    } catch (error) {
      return { values: [], error: describeNetworkError(error) };
    }
  }

  // The IANA bootstrap file maps each TLD to its registry's RDAP server. rdap.org blocks
  // automated clients (403), so we query the registry directly. Cached for a day.
  let bootstrap = null;
  async function rdapBaseFor(tld, timeoutMs) {
    if (!bootstrap || Date.now() - bootstrap.at > 86_400_000) {
      const res = await rdapFetch(IANA_RDAP_BOOTSTRAP, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new MonitorProbeError("No se pudo consultar la lista de registros RDAP.");
      bootstrap = { at: Date.now(), services: (await res.json()).services ?? [] };
    }
    const service = bootstrap.services.find(([tlds]) => tlds.includes(tld));
    const base = service?.[1]?.find((url) => url.startsWith("https://"));
    return base ? base.replace(/\/?$/, "/") : null;
  }

  // Registration expiry through RDAP. Hosts come from IANA's list; only the domain label varies.
  async function probeDomain({ host, timeoutMs = 8000 }) {
    const domain = registrableDomain(host);
    if (!/^[a-z0-9.-]+$/.test(domain)) return { error: "El dominio no es valido." };
    try {
      const base = await rdapBaseFor(domain.split(".").pop(), timeoutMs);
      if (!base) return { domain, expiresAt: null, noData: true };
      const res = await rdapFetch(`${base}domain/${domain}`, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/rdap+json" } });
      if (!res.ok) return { domain, expiresAt: null, noData: true };
      const json = await res.json();
      const event = (json.events ?? []).find((e) => e.eventAction === "expiration");
      return { domain, expiresAt: event?.eventDate ? new Date(event.eventDate).toISOString() : null, noData: !event };
    } catch (error) {
      return { domain, error: describeNetworkError(error) };
    }
  }

  return { probeHttp, probeSsl, probeTcp, probeDns, probeDomain };
}

// Pure evaluators: take a probe result plus config, return the monitor state.
export function evaluateHttpCheck(result, config = {}) {
  const min = config.expectedMin ?? 200;
  const max = config.expectedMax ?? 399;
  if (result.error) return { ok: false, state: "down", error: result.error, detail: null };
  if (result.statusCode < min || result.statusCode > max) {
    return { ok: false, state: "down", error: `Respuesta HTTP ${result.statusCode}.`, detail: null };
  }
  if (config.maxLatencyMs && result.latencyMs > config.maxLatencyMs) {
    return { ok: true, state: "degraded", error: `Respuesta lenta (${result.latencyMs} ms).`, detail: null };
  }
  return { ok: true, state: "up", error: null, detail: null };
}

export function evaluateSslCheck(result, config = {}, now = new Date()) {
  if (result.error) return { ok: false, state: "down", error: result.error, detail: null };
  const validTo = result.validTo ? new Date(result.validTo) : null;
  const daysLeft = validTo ? Math.floor((validTo.getTime() - now.getTime()) / 86_400_000) : null;
  const detail = { daysLeft, validTo: result.validTo, issuer: result.issuer };
  if (daysLeft !== null && daysLeft < 0) return { ok: false, state: "down", error: "El certificado SSL esta vencido.", detail };
  if (!result.authorized) {
    return { ok: false, state: "down", error: `Certificado SSL invalido (${result.authorizationError ?? "no confiable"}).`, detail };
  }
  if (daysLeft !== null && daysLeft <= (config.warnDays ?? 14)) {
    return { ok: true, state: "degraded", error: `El certificado SSL vence en ${daysLeft} dias.`, detail };
  }
  return { ok: true, state: "up", error: null, detail };
}

export function evaluateKeywordCheck(result, config = {}) {
  const base = evaluateHttpCheck(result, config);
  if (!base.ok) return base;
  const body = String(result.body ?? "").toLowerCase();
  const must = config.mustContain?.trim().toLowerCase();
  const mustNot = config.mustNotContain?.trim().toLowerCase();
  if (must && !body.includes(must)) return { ok: false, state: "down", error: `La pagina no contiene el texto esperado "${config.mustContain}".`, detail: null };
  if (mustNot && body.includes(mustNot)) return { ok: false, state: "down", error: `La pagina contiene el texto no permitido "${config.mustNotContain}".`, detail: null };
  return base;
}

function readPath(value, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), value);
}

export function evaluateApiCheck(result, config = {}) {
  const base = evaluateHttpCheck(result, config);
  if (!base.ok) return base;
  const rule = config.assert;
  if (!rule?.path) return base;
  let json;
  try {
    json = JSON.parse(result.body ?? "");
  } catch {
    return { ok: false, state: "down", error: "La respuesta no es JSON valido.", detail: null };
  }
  const actual = readPath(json, rule.path);
  if ("equals" in rule ? actual !== rule.equals : actual === undefined) {
    return { ok: false, state: "down", error: `La respuesta no cumple la validacion "${rule.path}".`, detail: null };
  }
  return base;
}

export function evaluateHeartbeat(monitor, now = new Date()) {
  const graceMs = (monitor.config?.graceSeconds ?? 60) * 1000;
  const last = monitor.lastPingAt ?? monitor.createdAt;
  const limit = (monitor.intervalSeconds ?? 300) * 1000 + graceMs;
  if (now.getTime() - new Date(last).getTime() > limit) {
    const minutes = Math.round((now.getTime() - new Date(last).getTime()) / 60000);
    return { ok: false, state: "down", error: `No se recibe senal desde hace ${minutes} min.`, detail: null };
  }
  return { ok: true, state: "up", error: null, detail: null };
}

export function evaluateTcpCheck(result) {
  return result.connected
    ? { ok: true, state: "up", error: null, detail: null }
    : { ok: false, state: "down", error: result.error ?? "No se pudo conectar.", detail: null };
}

export function evaluateDnsCheck(result, config = {}) {
  if (result.error) return { ok: false, state: "down", error: result.error, detail: null };
  if (!result.values.length) return { ok: false, state: "down", error: "El dominio no tiene registros de ese tipo.", detail: null };
  const expected = config.expected?.trim().toLowerCase();
  if (expected && !result.values.some((value) => String(value).toLowerCase().includes(expected))) {
    return { ok: false, state: "down", error: `Ningun registro contiene "${config.expected}".`, detail: { values: result.values.slice(0, 5) } };
  }
  return { ok: true, state: "up", error: null, detail: { values: result.values.slice(0, 5) } };
}

export function evaluateDomainCheck(result, config = {}, now = new Date()) {
  if (result.error) return { ok: false, state: "down", error: result.error, detail: null };
  if (!result.expiresAt) {
    // Many registries do not publish RDAP data; that is unknown, not an outage.
    return { ok: true, state: "unknown", error: "El registro no publica la fecha de vencimiento.", detail: { domain: result.domain, daysLeft: null } };
  }
  const daysLeft = Math.floor((new Date(result.expiresAt).getTime() - now.getTime()) / 86_400_000);
  const detail = { domain: result.domain, daysLeft, validTo: result.expiresAt };
  if (daysLeft < 0) return { ok: false, state: "down", error: "El dominio esta vencido.", detail };
  if (daysLeft <= (config.warnDays ?? 30)) return { ok: true, state: "degraded", error: `El dominio vence en ${daysLeft} dias.`, detail };
  return { ok: true, state: "up", error: null, detail };
}
