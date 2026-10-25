// Incoming webhooks of company automations: another system sends a JSON message
// to the secret URL of an automation and it runs as if an event had happened.
// Spec docs/superpowers/specs/2026-10-25-automation-canvas-and-webhooks-design.md.
//
// Protection: the URL carries a secret token (treat it like a password, it can be
// regenerated), an optional allow-list of origins (IPs / networks) managed by an
// administrator, JSON only, 64 KB at most, and a per-automation rate limit. Every
// accepted message is stored (last 20 per automation) and queued through the
// domain event outbox, so it is delivered at least once with retries.
import crypto from "node:crypto";
import net from "node:net";
import { publishDomainEvent } from "./domain-events/events.js";

export const ORIGINS_KEY = "automation_inbound_origins";
export const WEBHOOK_EVENT = "automations.webhook.received";
export const MAX_BODY_BYTES = 64 * 1024;
const MAX_ORIGINS = 50;
const KEEP_EVENTS = 20;
const RATE_PER_MINUTE = 60;
const MAX_KEYS = 100;
const MAX_DEPTH = 3;

export class WebhookError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "WebhookError";
    this.status = status;
  }
}

const sanitizeKey = (parts) => {
  const key = parts.join("_").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 61);
  return /^[a-zA-Z]/.test(key) ? key : key ? `f_${key}`.slice(0, 61) : "";
};

// { cliente: { nombre: "Ana" }, total: 5 } -> { cliente_nombre: "Ana", total: 5 }.
// Arrays and deeper objects become short JSON text. Pure; exported for tests.
export function flattenPayload(value) {
  const out = {};
  const walk = (node, path, depth) => {
    if (Object.keys(out).length >= MAX_KEYS) return;
    if (node && typeof node === "object" && !Array.isArray(node) && depth < MAX_DEPTH) {
      for (const [name, child] of Object.entries(node)) walk(child, [...path, name], depth + 1);
      return;
    }
    const key = sanitizeKey(path);
    if (!key) return;
    if (node === null || node === undefined) out[key] = null;
    else if (typeof node === "string") out[key] = node.slice(0, 1000);
    else if (typeof node === "number" || typeof node === "boolean") out[key] = node;
    else out[key] = JSON.stringify(node).slice(0, 500);
  };
  walk(value, [], 0);
  return out;
}

const normalizeIp = (ip) => String(ip ?? "").trim().replace(/^::ffff:/i, "");

function parseOrigin(entry) {
  const text = String(entry ?? "").trim();
  const [address, prefix, ...rest] = text.split("/");
  const family = net.isIP(address);
  if (!family || rest.length) return null;
  if (prefix === undefined) return { address, family };
  const bits = Number(prefix);
  if (!/^\d{1,3}$/.test(prefix) || bits < 0 || bits > (family === 4 ? 32 : 128)) return null;
  return { address, family, bits };
}

// Empty list = every origin (the secret URL is then the only protection).
export function isOriginAllowed(ip, origins) {
  if (!origins.length) return true;
  const address = normalizeIp(ip);
  const family = net.isIP(address);
  if (!family) return false;
  const list = new net.BlockList();
  for (const entry of origins) {
    const parsed = parseOrigin(entry);
    if (!parsed) continue;
    if (parsed.bits === undefined) list.addAddress(parsed.address, parsed.family === 4 ? "ipv4" : "ipv6");
    else list.addSubnet(parsed.address, parsed.bits, parsed.family === 4 ? "ipv4" : "ipv6");
  }
  return list.check(address, family === 4 ? "ipv4" : "ipv6");
}

export function createAutomationWebhooksService({ prisma, now = () => new Date() }) {
  const hits = new Map();

  function limited(token) {
    const cutoff = now().getTime() - 60_000;
    const recent = (hits.get(token) ?? []).filter((time) => time > cutoff);
    recent.push(now().getTime());
    hits.set(token, recent);
    if (hits.size > 5000) for (const [key, times] of hits) if (!times.some((time) => time > cutoff)) hits.delete(key);
    return recent.length > RATE_PER_MINUTE;
  }

  async function getOrigins() {
    const row = await prisma.instanceConfig.findUnique({ where: { key: ORIGINS_KEY }, select: { value: true } });
    try {
      const parsed = JSON.parse(row?.value ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  async function setOrigins(origins) {
    const clean = [...new Set((Array.isArray(origins) ? origins : []).map((item) => String(item).trim()).filter(Boolean))];
    if (clean.length > MAX_ORIGINS) throw new WebhookError(`Máximo ${MAX_ORIGINS} orígenes.`);
    const invalid = clean.find((entry) => !parseOrigin(entry));
    if (invalid) throw new WebhookError(`"${invalid}" no es una dirección IP ni una red válida (ejemplo: 203.0.113.7 o 203.0.113.0/24).`);
    await prisma.instanceConfig.upsert({ where: { key: ORIGINS_KEY }, update: { value: JSON.stringify(clean) }, create: { key: ORIGINS_KEY, value: JSON.stringify(clean) } });
    return clean;
  }

  const newToken = () => crypto.randomBytes(24).toString("base64url");

  // The message an external system sent. Unknown or paused automations answer 404
  // (nothing is revealed about which tokens exist).
  async function ingest({ token, bodyText, contentType = "", ip }) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(token ?? ""))) throw new WebhookError("No encontrado.", 404);
    const row = await prisma.systemAutomation.findUnique({ where: { webhookToken: token } });
    if (!row || !row.enabled || row.definition?.trigger?.type !== "webhook") throw new WebhookError("No encontrado.", 404);
    if (limited(token)) throw new WebhookError("Demasiados mensajes: espera un minuto.", 429);
    if (!isOriginAllowed(ip, await getOrigins())) throw new WebhookError("Este origen no está permitido.", 403);
    if (Buffer.byteLength(bodyText ?? "") > MAX_BODY_BYTES) throw new WebhookError("El mensaje supera 64 KB.", 413);
    if (contentType && !/json/i.test(contentType)) throw new WebhookError("Envía el mensaje como JSON (Content-Type: application/json).", 415);
    let parsed;
    try { parsed = JSON.parse(bodyText || "{}"); } catch { throw new WebhookError("El cuerpo no es un JSON válido.", 400); }
    if (parsed === null || typeof parsed !== "object") throw new WebhookError("El JSON debe ser un objeto o una lista.", 400);
    const data = flattenPayload(Array.isArray(parsed) ? { items: parsed } : parsed);

    const event = await prisma.automationWebhookEvent.create({ data: { companyId: row.companyId, automationKey: row.key, payload: data, sourceIp: normalizeIp(ip) || null } });
    const stale = await prisma.automationWebhookEvent.findMany({
      where: { companyId: row.companyId, automationKey: row.key }, orderBy: { createdAt: "desc" }, skip: KEEP_EVENTS, select: { id: true },
    });
    if (stale.length) await prisma.automationWebhookEvent.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
    await publishDomainEvent(prisma, { companyId: row.companyId, event: WEBHOOK_EVENT, payload: { automationKey: row.key, data } });
    return { id: event.id, received: Object.keys(data).length };
  }

  async function recentEvents({ companyId, key, limit = 10 }) {
    const rows = await prisma.automationWebhookEvent.findMany({
      where: { companyId, automationKey: key }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(Number(limit) || 10, 1), KEEP_EVENTS),
    });
    return rows.map((row) => ({ id: row.id, createdAt: row.createdAt, sourceIp: row.sourceIp, data: row.payload }));
  }

  return { getOrigins, setOrigins, newToken, ingest, recentEvents };
}
