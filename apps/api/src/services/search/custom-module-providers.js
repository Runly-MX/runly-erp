// Global search for Builder (RME3) modules. A model is searched by its "Buscable" text
// fields (`searchable: true` in the field definition); when none is marked, by its first
// two text fields. Table and column names come from the stored model definition and are
// only used after an identifier check, never from the request. Spec
// docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 5.
import { Prisma } from "@prisma/client";
import { defineProvider, tokenSearch, safeTitle, joinParts } from "./helpers.js";

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const TEXT_TYPES = new Set(["text", "textarea", "email", "phone", "url"]);
const MAX_COLUMNS = 4;
const CACHE_MS = 60_000;

// Columns of a model that global search looks at (pure; exported for tests).
export function searchableColumns(schema) {
  const fields = (Array.isArray(schema?.fields) ? schema.fields : []).filter((field) => IDENT.test(field?.name ?? "") && TEXT_TYPES.has(field.type));
  const marked = fields.filter((field) => field.searchable === true);
  return (marked.length ? marked : fields.slice(0, 2)).slice(0, MAX_COLUMNS).map((field) => field.name);
}

// Where the module lists this model (the Builder's generated navigation path).
export const customListPath = (moduleKey, modelName) => `/app/m/${moduleKey}/${String(modelName).replace(/\./g, "-")}s`;

export function buildCustomProvider(model) {
  const columns = searchableColumns(model.schema);
  if (!columns.length || !IDENT.test(model.tableName ?? "")) return null;
  const listPath = customListPath(model.moduleKey, model.name);
  const soft = model.schema?.softDelete === true;
  return defineProvider({
    source: `custom:${model.name}`,
    moduleKey: model.moduleKey,
    label: model.pluralLabel || model.label,
    permission: `${model.name}.read`,
    icon: "Boxes",
    target: () => listPath,
    seeAllTarget: () => listPath,
    search: ({ prisma, companyId, q, limit }) =>
      tokenSearch(prisma, {
        q,
        limit,
        from: `"${model.tableName}" t`,
        select: `t.id, ${columns.map((column) => `t."${column}" AS c_${column}`).join(", ")}`,
        scope: soft ? Prisma.sql`t.company_id = ${companyId}::uuid AND t.enabled = true` : Prisma.sql`t.company_id = ${companyId}::uuid`,
        columns: columns.map((column) => `t."${column}"`),
        titleColumn: `t."${columns[0]}"`,
        orderBy: "t.updated_at DESC",
        map: (row) => ({
          id: row.id,
          title: safeTitle(model.label, row[`c_${columns[0]}`]),
          subtitle: joinParts([model.label, ...columns.slice(1).map((column) => row[`c_${column}`])]),
          icon: "Boxes",
        }),
      }),
  });
}

// Providers of the installed Builder modules enabled for a company (cached for a minute).
export function createCustomProviders({ prisma, now = () => Date.now() }) {
  let models = null;
  const byCompany = new Map();

  async function loadModels() {
    if (models && now() - models.at < CACHE_MS) return models;
    const modules = await prisma.runlyModule.findMany({ where: { key: { startsWith: "custom." }, status: "INSTALLED", enabled: true }, select: { id: true, key: true, name: true } });
    const rows = modules.length
      ? await prisma.runlyModel.findMany({ where: { moduleKey: { in: modules.map((m) => m.key) }, enabled: true, companyScoped: true }, select: { name: true, moduleKey: true, tableName: true, label: true, pluralLabel: true, schema: true } })
      : [];
    models = { at: now(), modules, providers: rows.map(buildCustomProvider).filter(Boolean) };
    byCompany.clear();
    return models;
  }

  return async function providersFor(companyId) {
    const loaded = await loadModels();
    const cached = byCompany.get(companyId);
    if (cached && now() - cached.at < CACHE_MS) return cached.providers;
    const off = await prisma.companyModule.findMany({ where: { companyId, enabled: false, moduleId: { in: loaded.modules.map((m) => m.id) } }, select: { moduleId: true } });
    const offKeys = new Set(loaded.modules.filter((m) => off.some((row) => row.moduleId === m.id)).map((m) => m.key));
    const providers = loaded.providers.filter((provider) => !offKeys.has(provider.moduleKey));
    byCompany.set(companyId, { at: now(), providers });
    return providers;
  };
}
