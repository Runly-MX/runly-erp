// Orchestration of GET /search: permission gating, module scope first,
// fallback to the other modules, then close-match suggestions.
import { findSuggestions } from "./suggestions.js";

export const DEFAULT_LIMIT = 5;
export const SCOPED_DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 10;
export const OTHER_MODULES_LIMIT = 5;
export const PROVIDER_TIMEOUT_MS = 2500;

export function parseLimit(raw, fallback) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`search provider ${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callProvider(provider, ctx) {
  if (typeof provider.search === "function") return provider.search(ctx);
  const items = await provider.run(ctx);
  return { items, total: Array.isArray(items) ? items.length : 0 };
}

// Runs providers in isolation; failures/timeouts are logged (dev) and dropped.
export async function runProviders(providers, ctx, timeoutMs) {
  const settled = await Promise.allSettled(
    providers.map((provider) =>
      withTimeout(Promise.resolve().then(() => callProvider(provider, ctx)), timeoutMs, provider.source),
    ),
  );
  const groups = [];
  settled.forEach((result, index) => {
    const provider = providers[index];
    if (result.status === "rejected") {
      if (process.env.NODE_ENV !== "production") console.error(`[search:${provider.source}]`, result.reason?.message);
      return;
    }
    const items = Array.isArray(result.value?.items) ? result.value.items : [];
    if (!items.length) return;
    groups.push({
      source: provider.source,
      moduleKey: provider.moduleKey ?? null,
      label: provider.label,
      total: Math.max(Number(result.value.total) || 0, items.length),
      seeAllTarget: provider.seeAllTarget?.(ctx.q) ?? null,
      items: items.map((item) => ({ ...item, source: provider.source, target: item.target ?? provider.target(item.id) })),
    });
  });
  return groups;
}

export async function runSearch({
  prisma, providers: staticProviders, dynamicProviders = null, moduleLabels = {}, tenant, actorId, q, moduleKey, limit,
  timeoutMs = PROVIDER_TIMEOUT_MS, suggest = findSuggestions,
}) {
  const companyId = tenant.companyId;
  // Providers that depend on the installed modules (Builder modules) are resolved per company;
  // a failure there only drops them, never the rest of the search.
  const extra = dynamicProviders ? await dynamicProviders(companyId).catch(() => []) : [];
  const providers = extra.length ? [...staticProviders, ...extra] : staticProviders;
  const scope = moduleKey && providers.some((p) => p.moduleKey === moduleKey) ? moduleKey : null;
  const allowed = providers.filter((p) => tenant.isAdmin || tenant.permissionSet?.has(p.permission));
  const base = { prisma, companyId, actorId, q };
  const response = { query: q, scope, scopeLabel: scope ? (moduleLabels[scope] ?? null) : null, fallback: false, groups: [], suggestions: [] };

  if (scope) {
    const scopeLimit = parseLimit(limit, SCOPED_DEFAULT_LIMIT);
    response.groups = await runProviders(allowed.filter((p) => p.moduleKey === scope), { ...base, limit: scopeLimit }, timeoutMs);
    if (!response.groups.length) {
      const otherLimit = Math.min(parseLimit(limit, DEFAULT_LIMIT), OTHER_MODULES_LIMIT);
      response.groups = await runProviders(allowed.filter((p) => p.moduleKey && p.moduleKey !== scope), { ...base, limit: otherLimit }, timeoutMs);
      response.fallback = response.groups.length > 0;
    }
  } else {
    response.groups = await runProviders(allowed, { ...base, limit: parseLimit(limit, DEFAULT_LIMIT) }, timeoutMs);
  }

  // Help is fuzzy and almost always answers: it does not count as a record hit.
  if (response.groups.every((g) => g.source === "help")) {
    try {
      response.suggestions = await withTimeout(suggest({ prisma, providers: allowed, companyId, actorId, q, scope }), 1500, "suggestions");
    } catch {
      response.suggestions = [];
    }
  }
  return response;
}
