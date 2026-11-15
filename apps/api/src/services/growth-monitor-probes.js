import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";

import { isPublicAddress } from "./automation-http-service.js";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

export class MonitorProbeError extends Error {}

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

function defaultRequest({ url, method, timeoutMs, lookup }) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(url, { method, lookup, timeout: timeoutMs, headers: { "user-agent": "RunlyMonitor/1.0" } }, (res) => {
      res.resume();
      resolve({ statusCode: res.statusCode ?? 0, location: res.headers.location ?? null });
    });
    req.on("timeout", () => req.destroy(new MonitorProbeError("Tiempo de espera agotado.")));
    req.on("error", reject);
    req.end();
  });
}

export function createGrowthMonitorProbes({
  resolveHost = dns.promises.lookup,
  request = defaultRequest,
  connectTls = tls.connect,
  allowPrivate = process.env.RUNLY_GROWTH_MONITOR_ALLOW_PRIVATE === "true",
} = {}) {
  async function probeHttp({ url: rawUrl, method = "GET", timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const started = Date.now();
    let url;
    try {
      url = new URL(rawUrl);
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        if (!["http:", "https:"].includes(url.protocol)) throw new MonitorProbeError("Solo se permite http o https.");
        const target = await resolvePinned(url.hostname, { resolveHost, allowPrivate });
        const res = await request({ url, method, timeoutMs, lookup: pinnedLookup(target) });
        if (res.statusCode >= 300 && res.statusCode < 400 && res.location && hop < MAX_REDIRECTS) {
          url = new URL(res.location, url);
          continue;
        }
        return { statusCode: res.statusCode, latencyMs: Date.now() - started, error: null };
      }
      throw new MonitorProbeError("Demasiadas redirecciones.");
    } catch (error) {
      return { statusCode: null, latencyMs: Date.now() - started, error: error?.message || String(error) };
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
      return { error: error?.message || String(error) };
    }
  }

  return { probeHttp, probeSsl };
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
