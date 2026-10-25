// Document kinds declared by Builder (RME3) modules in their manifest
// (`documentKinds`, see packages/module-engine/src/manifest-integrations.js).
// The kind key is `<moduleKey>.<name>`; the record is read from the module's own
// table (RunlyModel.tableName) in the active company, and only the declared
// field tags reach the template. Kinds are registered while the module is
// installed and enabled and unregistered when it is disabled or removed.
import { DocumentProviderError } from "../document-errors.js";

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const builderKindKey = (moduleKey, name) => `${moduleKey}.${name}`;

export function createBuilderDocumentKind({ prisma, moduleKey, spec }) {
  const tags = spec.fields.map((field) => field.tag);
  return {
    key: builderKindKey(moduleKey, spec.name),
    label: spec.label,
    moduleKey,
    permissionKey: spec.permission,
    formats: spec.formats ?? ["docx", "xlsx", "pptx", "pdf"],
    schema: spec.fields.map((field) => ({ tag: field.tag, label: field.label, type: field.type })),
    builder: true,
    async load({ companyId, sourceId }) {
      if (!UUID.test(String(sourceId ?? ""))) throw new DocumentProviderError("Registro no encontrado.", 404, "source_not_found");
      const model = await prisma.runlyModel.findFirst({
        where: { moduleKey, enabled: true, OR: [{ name: spec.model }, { name: { endsWith: `.${spec.model}` } }] },
        select: { tableName: true },
      });
      if (!model || !SAFE_IDENTIFIER.test(model.tableName)) throw new DocumentProviderError("El módulo no tiene la tabla de este documento.", 404, "source_not_found");
      // The table name comes from the module registry and is validated above; ids are bound.
      const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${model.tableName}" WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1`, sourceId, companyId);
      const row = rows?.[0];
      if (!row || row.enabled === false) throw new DocumentProviderError("Registro no encontrado.", 404, "source_not_found");
      return Object.fromEntries(tags.map((tag) => {
        const value = row[tag];
        return [tag, value === null || value === undefined ? "" : typeof value === "boolean" ? (value ? "Sí" : "No") : value];
      }));
    },
  };
}

// Reconciles the registry with the manifests of the installed, enabled modules.
// Returns { registered, removed } (keys) for logs and tests.
export function createBuilderKindSync({ prisma, kinds }) {
  async function sync() {
    const modules = await prisma.runlyModule.findMany({ where: { status: "INSTALLED", enabled: true }, select: { key: true, manifest: true } });
    const wanted = new Map();
    for (const mod of modules) {
      const list = Array.isArray(mod.manifest?.documentKinds) ? mod.manifest.documentKinds : [];
      for (const spec of list) {
        if (!spec?.name || !SAFE_IDENTIFIER.test(String(spec.model ?? "")) || !Array.isArray(spec.fields) || !spec.permission) continue;
        const kind = createBuilderDocumentKind({ prisma, moduleKey: mod.key, spec });
        wanted.set(kind.key, kind);
      }
    }
    const removed = [];
    for (const kind of kinds.listKinds()) {
      if (kind.builder && !wanted.has(kind.key)) { kinds.unregister(kind.key); removed.push(kind.key); }
    }
    const registered = [];
    for (const [key, kind] of wanted) {
      const current = kinds.getKind(key);
      if (current && !current.builder) continue; // never shadow a built-in kind
      if (current) kinds.unregister(key);
      kinds.register(kind);
      registered.push(key);
    }
    return { registered, removed };
  }
  return { sync };
}
