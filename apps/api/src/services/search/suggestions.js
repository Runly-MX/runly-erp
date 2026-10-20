// "Did you mean" suggestions for GET /search when nothing matched: pg_trgm
// similarity / word_similarity (threshold 0.3) over the main text columns.
// Best effort: a single UNION ALL query that returns nothing on failure.
import { Prisma } from "@prisma/client";
import { normalizeSearchText, normColumn } from "../../lib/search-tokens.js";
import { createInventoryAccess } from "../inventory-access.js";

export const SUGGESTION_THRESHOLD = 0.3;
export const SUGGESTION_MAX = 5;

// Rows `id, text, score`: the best-matching candidate text per record.
function similarRows({ from, scope, candidates, nq, perSource = 3 }) {
  return Prisma.sql`
    SELECT t.id, v.text, v.score
    FROM ${Prisma.raw(from)}
    CROSS JOIN LATERAL (
      SELECT x.text, GREATEST(similarity(${nq}, ${normColumn("x.text")}), word_similarity(${nq}, ${normColumn("x.text")})) AS score
      FROM (VALUES ${Prisma.join(candidates.map((c) => Prisma.sql`(${Prisma.raw(c)}::text)`), ", ")}) AS x(text)
      WHERE x.text IS NOT NULL AND x.text <> ''
      ORDER BY score DESC LIMIT 1
    ) v
    WHERE ${scope} AND v.score >= ${SUGGESTION_THRESHOLD}
    ORDER BY v.score DESC LIMIT ${perSource}`;
}

// A source reuses its provider's permission/label/target.
export const SUGGESTION_SOURCES = [
  { source: "inventory", build: (c, a, nq, extras) => similarRows({ nq, from: "inv_item t", scope: Prisma.sql`t.company_id = ${c}::uuid AND t.enabled = true${extras?.inventoryAreaIds ? Prisma.sql` AND t.area_id = ANY(${extras.inventoryAreaIds}::uuid[])` : Prisma.empty}`, candidates: ["t.name", "t.serial_number", "t.asset_tag", "t.model"] }) },
  { source: "contacts", build: (c, a, nq) => similarRows({ nq, from: "contact t", scope: Prisma.sql`t.company_id = ${c}::uuid AND t.enabled = true`, candidates: ["t.name", "t.legal_name"] }) },
  { source: "employees", build: (c, a, nq) => similarRows({ nq, from: "hr_employee t", scope: Prisma.sql`t.company_id = ${c}::uuid AND t.enabled = true`, candidates: ["t.first_name || ' ' || t.last_name", "t.employee_code"] }) },
  { source: "purchase_orders", build: (c, a, nq) => similarRows({ nq, from: "purchase_order t", scope: Prisma.sql`t.company_id = ${c}::uuid`, candidates: ["t.number"] }) },
  { source: "purchase_invoices", build: (c, a, nq) => similarRows({ nq, from: "purchase_invoice t", scope: Prisma.sql`t.company_id = ${c}::uuid`, candidates: ["t.number"] }) },
  { source: "purchase_cases", build: (c, a, nq) => similarRows({ nq, from: "purchase_case t", scope: Prisma.sql`t.company_id = ${c}::uuid`, candidates: ["t.number", "t.title"] }) },
  {
    source: "projects",
    build: (c, a, nq) => similarRows({
      nq, from: "project t", candidates: ["t.name"],
      scope: Prisma.sql`t.company_id = ${c}::uuid AND t.status <> 'ARCHIVED' AND (t.owner_id = ${a}::uuid OR EXISTS (SELECT 1 FROM project_member pm WHERE pm.project_id = t.id AND pm.user_id = ${a}::uuid))`,
    }),
  },
];

// One round trip: every active source as a UNION ALL (each branch is limited).
export async function findSuggestions({ prisma, providers, companyId, actorId, q, scope = null, sources = SUGGESTION_SOURCES, inventoryAccess = createInventoryAccess({ prisma }) }) {
  const nq = normalizeSearchText(q).trim();
  if (nq.length < 3) return [];
  const bySource = new Map(providers.map((p) => [p.source, p]));
  const active = sources.filter((s) => bySource.has(s.source));
  if (!active.length) return [];
  // Inventory area scoping for the raw SQL: null = unrestricted, [] (no access / unresolved) = nothing.
  const extras = {};
  if (active.some((s) => s.source === "inventory")) {
    extras.inventoryAreaIds = await inventoryAccess.areaIdsFor({ companyId, actorId }).catch(() => []);
  }
  const union = Prisma.join(
    active.map((s) => Prisma.sql`(SELECT ${s.source}::text AS source, b.id, b.text, b.score FROM (${s.build(companyId, actorId, nq, extras)}) b)`),
    " UNION ALL ",
  );
  let rows;
  try {
    rows = await prisma.$queryRaw(union);
  } catch {
    return [];
  }
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const provider = bySource.get(row.source);
    const text = String(row.text ?? "").trim();
    if (!provider || !text || text === "null") continue;
    const boost = scope && provider.moduleKey === scope ? 0.1 : 0;
    out.push({ score: Number(row.score) + boost, suggestion: { text, source: provider.source, label: provider.label, target: provider.target(row.id) } });
  }
  out.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const result = [];
  for (const { suggestion } of out) {
    const key = normalizeSearchText(suggestion.text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(suggestion);
    if (result.length >= SUGGESTION_MAX) break;
  }
  return result;
}
