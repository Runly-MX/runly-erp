// GET /search — global record search across permission-gated providers.
// Contract: ?q=&module=<moduleKey>&limit= -> { query, scope, scopeLabel, fallback, groups, suggestions }
// (docs/ai-context/rme3-runtime-capabilities.md, "Global search").
import { Hono } from "hono";
import { SEARCH_PROVIDERS, SEARCH_MODULE_LABELS } from "../services/search/index.js";
import { runSearch } from "../services/search/run-search.js";

const MIN_QUERY_LENGTH = 2;

// resolveTenantContext: the same X-Runly-Company-Id-validating resolver
// requirePermission/requireAnyPermission use, injected rather than imported
// (index.js imports this router — importing back from index.js would be
// circular). See
// docs/superpowers/specs/2026-09-10-multi-tenant-architecture-design.md §5.
export function createSearchRouter({
  prisma, getUserContext, resolveTenantContext, providers = SEARCH_PROVIDERS, providerTimeoutMs, suggest,
}) {
  const app = new Hono();

  app.get("/search", async (c) => {
    const context = await getUserContext(c);
    if (!context?.profile) {
      return c.json({ error: "No autorizado." }, 401);
    }

    const q = String(c.req.query("q") ?? "").trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return c.json({ query: q, groups: [] });
    }

    // Non-strict: /search has no dedicated permission gate of its own (it
    // filters providers per-provider), so a multi-company user with no
    // active-company header yet still gets a (permission-less, hence empty)
    // response instead of a hard 400 — matches /runtime/modules' bootstrap
    // treatment, not requirePermission's strict one.
    const resolved = await resolveTenantContext(c, context, { strict: false });
    if (!resolved.ok) return resolved.response;
    const { tenant } = resolved;
    if (!tenant.companyId) {
      return c.json({ query: q, groups: [] });
    }

    const response = await runSearch({
      prisma,
      providers,
      moduleLabels: SEARCH_MODULE_LABELS,
      tenant,
      actorId: context.profile.id,
      q,
      moduleKey: String(c.req.query("module") ?? "").trim() || null,
      limit: c.req.query("limit"),
      ...(providerTimeoutMs ? { timeoutMs: providerTimeoutMs } : {}),
      ...(suggest ? { suggest } : {}),
    });
    return c.json(response);
  });

  return app;
}
