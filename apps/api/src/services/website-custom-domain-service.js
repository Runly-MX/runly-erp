import { randomBytes } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

import { WebsiteServiceError, notFound } from "../routes/website/service-helpers.js";
import { assertWebsiteAccess } from "./website-authorization-service.js";
import { strictWebsiteHostname } from "./website-gateway-service.js";
import {
  createGrowthMonitorProbes,
  describeNetworkError,
  evaluateSslCheck,
  registrableDomain,
} from "./growth-monitor-probes.js";

// Customer-owned hostnames for a site (spec 2026-11-14-website-custom-domains-design.md).
// Ownership is proven with a TXT record issued by this installation; the gateway then serves the
// host like any other (`state=assigned`, `ready=true`, registryManaged=false). Certificates are the
// operator's job: `httpsState` is informational and never gates serving.
const fail = (status, code, message) => new WebsiteServiceError(message, status, code);

// website_domain.state only allows the registry vocabulary; a released custom host is stored as 'quarantined'
// (the UI already shows that as "Liberada") and exposed to clients as 'released'.
const RELEASED = "quarantined";
const TXT_PREFIX = "_runly-verify.";
const RESERVED_LABELS = new Set(["admin", "api", "auth", "mcp", "internal"]);
const PENDING_TAKEOVER_MS = 60 * 60 * 1000;
const VERIFY_THROTTLE_MS = 10_000;
const HTTPS_THROTTLE_MS = 60_000;

const MESSAGES = {
  invalid: "Escribe un dominio válido, por ejemplo www.mitienda.mx.",
  reserved: "Ese dominio no se puede usar en este sitio.",
  taken: "Ese dominio ya está conectado a otro sitio.",
  inProgress: "Ese dominio tiene una conexión en curso. Inténtalo de nuevo más tarde.",
  limit: "Se alcanzó el máximo de dominios propios de esta empresa.",
  unavailable: "Esta instalación no tiene dominios propios habilitados.",
  txtMissing: "Todavía no encontramos el registro TXT. Los cambios de DNS pueden tardar unos minutos; inténtalo de nuevo.",
};

export function normalizeCustomHostname(input) {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > 253) throw fail(400, "invalid_hostname", MESSAGES.invalid);
  let host;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    throw fail(400, "invalid_hostname", MESSAGES.invalid);
  }
  host = host.replace(/\.$/, "").toLowerCase();
  if (net.isIP(host) || host.includes(":") || host.split(".").length < 2) throw fail(400, "invalid_hostname", MESSAGES.invalid);
  try {
    return strictWebsiteHostname(host);
  } catch {
    throw fail(400, "invalid_hostname", MESSAGES.invalid);
  }
}

const defaultResolveAddresses = async (host) => {
  const settle = async (promise) => { try { return await promise; } catch { return []; } };
  const [v4, v6, cnames] = await Promise.all([
    settle(dns.resolve4(host)), settle(dns.resolve6(host)), settle(dns.resolveCname(host)),
  ]);
  return { addresses: [...v4, ...v6], cnames: cnames.map((name) => name.toLowerCase().replace(/\.$/, "")) };
};

const defaultProbeHttps = async (host) => {
  const raw = await createGrowthMonitorProbes().probeSsl({ host, port: 443 });
  if (raw.error) return "unreachable";
  return evaluateSslCheck(raw, {}).ok ? "ok" : "invalid";
};

export function createWebsiteCustomDomainService({
  prisma,
  adminHosts = [],
  namespaceRoot = null,
  target = process.env.RUNLY_WEBSITE_CUSTOM_DOMAIN_TARGET || null,
  limit = Number(process.env.RUNLY_WEBSITE_CUSTOM_DOMAIN_LIMIT) || 25,
  resolveTxt = (name) => dns.resolveTxt(name),
  resolveAddresses = defaultResolveAddresses,
  probeHttps = defaultProbeHttps,
  onVerified = null,
  now = () => new Date(),
}) {
  const adminRegistrable = new Set(adminHosts.map((host) => registrableDomain(String(host).split(":")[0])));
  const lastRun = new Map();

  // Per host and action: bounds how often a tenant can make the server query DNS or open TLS connections.
  function throttle(key, ms) {
    const at = now().getTime();
    if (lastRun.size > 2000) for (const [k, t] of lastRun) if (at - t > 5 * 60_000) lastRun.delete(k);
    if (at - (lastRun.get(key) ?? 0) < ms) throw fail(429, "rate_limited", "Espera unos segundos antes de volver a intentarlo.");
    lastRun.set(key, at);
  }

  async function site(a, permissions) {
    for (const permission of permissions) assertWebsiteAccess(a.access, a.companyId, permission);
    if (!a.siteId) throw notFound("Recurso");
    const found = await prisma.websiteSite.findFirst({ where: { id: a.siteId, companyId: a.companyId, enabled: true } });
    if (!found) throw notFound("Recurso");
    return found;
  }

  function assertClaimable(hostname) {
    const first = hostname.split(".")[0];
    const underPlatform = namespaceRoot && (hostname === namespaceRoot || hostname.endsWith(`.${namespaceRoot}`));
    const isAdmin = adminHosts.some((host) => String(host).split(":")[0] === hostname) || adminRegistrable.has(registrableDomain(hostname));
    if (underPlatform || isAdmin || RESERVED_LABELS.has(first)) throw fail(409, "hostname_reserved", MESSAGES.reserved);
  }

  function routingRecord(hostname) {
    if (!target) return null;
    const apex = registrableDomain(hostname) === hostname;
    if (net.isIP(target)) return { type: net.isIPv6(target) ? "AAAA" : "A", name: hostname, value: target };
    return {
      type: apex ? "ALIAS" : "CNAME", name: hostname, value: target,
      ...(apex ? { note: "Un dominio sin subdominio no admite CNAME: usa ALIAS/ANAME si tu proveedor lo ofrece, o un registro A con la IP de tu servidor." } : {}),
    };
  }

  function view(row, { pointsHere } = {}) {
    if (!row) return null;
    const records = [];
    if (row.state === "pending" && row.verificationToken) {
      records.push({ type: "TXT", name: `${TXT_PREFIX}${row.hostname}`, value: row.verificationToken });
    }
    if (row.state !== RELEASED) {
      const routing = routingRecord(row.hostname);
      if (routing) records.push(routing);
    }
    // Most DNS panels expect the name relative to the zone ("www", "@" for the zone itself), not the full name.
    const zone = registrableDomain(row.hostname);
    const relative = (name) => (zone && name === zone ? "@" : zone && name.endsWith(`.${zone}`) ? name.slice(0, -zone.length - 1) : name);
    for (const record of records) record.host = relative(record.name);
    return {
      hostname: row.hostname, zone: zone ?? null, kind: "custom", state: row.state === RELEASED ? "released" : row.state, ready: row.ready,
      verified: row.state === "assigned" && Boolean(row.verifiedAt), verifiedAt: row.verifiedAt ?? null,
      httpsState: row.httpsState ?? "unknown", httpsCheckedAt: row.httpsCheckedAt ?? null,
      lastError: row.lastError ?? null, dnsRecords: records,
      ...(pointsHere === undefined ? {} : { pointsHere }),
    };
  }

  const owned = async (a) => {
    const row = await prisma.websiteDomain.findFirst({
      where: { hostname: normalizeCustomHostname(a.hostname), companyId: a.companyId, siteId: a.siteId, kind: "custom" },
    });
    if (!row) throw notFound("Recurso");
    return row;
  };

  async function pointsHereFor(hostname) {
    if (!target) return undefined;
    try {
      const { addresses, cnames } = await resolveAddresses(hostname);
      if (net.isIP(target)) return addresses.includes(target);
      if (cnames.includes(target.toLowerCase())) return true;
      const targetAddresses = (await resolveAddresses(target)).addresses;
      return addresses.some((address) => targetAddresses.includes(address));
    } catch {
      return false;
    }
  }

  async function list(a) {
    await site(a, ["website.site.read"]);
    const rows = await prisma.websiteDomain.findMany({ where: { companyId: a.companyId, siteId: a.siteId, kind: "custom" }, orderBy: { createdAt: "asc" } });
    return { available: Boolean(target), limit, items: rows.map((row) => view(row)) };
  }

  async function add(a) {
    await site(a, ["website.domains.manage", "website.site.update"]);
    if (!target) throw fail(409, "custom_domains_unavailable", MESSAGES.unavailable);
    const hostname = normalizeCustomHostname(a.hostname);
    assertClaimable(hostname);
    const token = randomBytes(32).toString("base64url");
    const existing = await prisma.websiteDomain.findUnique({ where: { hostname } });

    if (existing) {
      const mine = existing.companyId === a.companyId && existing.siteId === a.siteId;
      if (existing.kind !== "custom") throw fail(409, "hostname_taken", MESSAGES.taken);
      if (mine && existing.state !== RELEASED) return view(existing);
      if (existing.companyId === a.companyId && existing.state !== RELEASED) throw fail(409, "hostname_taken", MESSAGES.taken);
      if (!mine && existing.state === "assigned") throw fail(409, "hostname_taken", MESSAGES.taken);
      const stalePending = existing.state === "pending" && now().getTime() - new Date(existing.createdAt).getTime() > PENDING_TAKEOVER_MS;
      if (!mine && existing.state === "pending" && !stalePending) throw fail(409, "claim_in_progress", MESSAGES.inProgress);
      // Released (or stale pending) names are claimed again; ownership is proven by DNS, never by history.
      const reclaimed = await prisma.websiteDomain.updateMany({
        where: { hostname, state: existing.state, kind: "custom" },
        data: {
          companyId: a.companyId, siteId: a.siteId, state: "pending", ready: false, verificationToken: token,
          verifiedAt: null, httpsState: null, httpsCheckedAt: null, lastError: null, dnsTarget: target, createdAt: now(),
        },
      });
      if (!reclaimed.count) throw fail(409, "hostname_taken", MESSAGES.taken);
      return view(await prisma.websiteDomain.findUnique({ where: { hostname } }));
    }

    const used = await prisma.websiteDomain.count({ where: { companyId: a.companyId, kind: "custom", state: { not: RELEASED } } });
    if (used >= limit) throw fail(409, "limit_reached", MESSAGES.limit);
    try {
      return view(await prisma.websiteDomain.create({
        data: {
          hostname, companyId: a.companyId, siteId: a.siteId, kind: "custom", state: "pending", ready: false,
          registryManaged: false, verificationToken: token, dnsTarget: target,
        },
      }));
    } catch (error) {
      if (error.code === "P2002") throw fail(409, "hostname_taken", MESSAGES.taken);
      throw error;
    }
  }

  async function status(a) {
    await site(a, ["website.site.read"]);
    const row = await owned(a);
    return view(row, { pointsHere: row.state === RELEASED ? undefined : await pointsHereFor(row.hostname) });
  }

  async function verify(a) {
    await site(a, ["website.domains.manage"]);
    const row = await owned(a);
    if (row.state === RELEASED) throw fail(409, "hostname_released", "Ese dominio ya fue liberado. Agrégalo de nuevo para conectarlo.");
    if (row.state === "assigned") return view(row, { pointsHere: await pointsHereFor(row.hostname) });
    throttle(`verify:${row.hostname}`, VERIFY_THROTTLE_MS);

    let found = false;
    let error = null;
    try {
      const records = await resolveTxt(`${TXT_PREFIX}${row.hostname}`);
      found = records.some((chunks) => (Array.isArray(chunks) ? chunks.join("") : String(chunks)).trim() === row.verificationToken);
    } catch (err) {
      error = ["ENODATA", "ENOTFOUND"].includes(err?.code) ? null : describeNetworkError(err);
    }
    if (!found) {
      const updated = await prisma.websiteDomain.update({ where: { hostname: row.hostname }, data: { lastError: error ?? MESSAGES.txtMissing } });
      return view(updated, { pointsHere: await pointsHereFor(row.hostname) });
    }
    const updated = await prisma.websiteDomain.update({
      where: { hostname: row.hostname },
      data: { state: "assigned", ready: true, verifiedAt: now(), verificationToken: null, lastError: null },
    });
    if (onVerified) {
      try { await onVerified({ companyId: a.companyId, siteId: a.siteId, hostname: row.hostname }); } catch (err) { console.error("[website.custom-domain.onVerified]", err?.message ?? err); }
    }
    return view(updated, { pointsHere: await pointsHereFor(row.hostname) });
  }

  async function checkHttps(a) {
    await site(a, ["website.domains.manage"]);
    const row = await owned(a);
    if (row.state !== "assigned") throw fail(409, "not_verified", "Verifica primero la propiedad del dominio.");
    throttle(`https:${row.hostname}`, HTTPS_THROTTLE_MS);
    const httpsState = await probeHttps(row.hostname);
    return view(await prisma.websiteDomain.update({ where: { hostname: row.hostname }, data: { httpsState, httpsCheckedAt: now() } }));
  }

  // The row is kept (append-only) but stops serving at once.
  async function release(a) {
    await site(a, ["website.domains.manage"]);
    const row = await owned(a);
    if (row.state === RELEASED) return view(row);
    return view(await prisma.websiteDomain.update({
      where: { hostname: row.hostname },
      data: { state: RELEASED, ready: false, verificationToken: null, httpsState: null, lastError: null },
    }));
  }

  return { list, add, status, verify, checkHttps, release };
}
