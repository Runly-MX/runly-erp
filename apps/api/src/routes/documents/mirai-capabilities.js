// apps/api/src/routes/documents/mirai-capabilities.js
//
// runly.documents capability shared by MirAI and the MCP server: list the
// document kinds and templates the person can use, and propose generating a
// document from a template (prepare / approve / commit, like every action).
// Kind permissions and personal / company template visibility are the same as
// in the Documents routes and the `documents.generate` module service.
import { createDocumentsAccess, createDocumentsHandlers } from "../../services/module-services/documents-services.js";
import { getSharedDocumentsHub } from "./documents-hub.js";

class CapabilityError extends Error {
  constructor(message, status = 400, code = "error") { super(message); this.status = status; this.code = code; }
}

const LINK = (fileId) => `/app/m/runly.files?fileId=${fileId}`;
const FORMAT_ES = { docx: "Word", xlsx: "Excel", pptx: "PowerPoint", pdf: "PDF" };

export function createDocumentsMiraiCapabilities({ prisma, hub = null }) {
  const current = () => hub ?? getSharedDocumentsHub();
  const access = () => createDocumentsAccess({ ServiceError: CapabilityError, hub: current() });
  const handlers = () => createDocumentsHandlers({ prisma, ServiceError: CapabilityError, hub: current() });
  const callerOf = (actx) => ({ companyId: actx.companyId, actorId: actx.actorProfileId, system: false, isAdmin: Boolean(actx.isAdmin), permissionKeys: [...(actx.permissionSet ?? [])] });
  // Errors the person can fix are returned as { error } so the assistant explains them.
  const guarded = async (fn) => {
    try { return await fn(); } catch (error) {
      if (error instanceof CapabilityError) return { error: error.message };
      throw error;
    }
  };
  const pairs = (list) => Object.fromEntries((Array.isArray(list) ? list : []).filter((item) => item?.tag).map((item) => [String(item.tag), String(item.value ?? "")]));

  const tools = [
    {
      name: "documents_kinds",
      permission: "documents.templates.read",
      definition: {
        description: "Tipos de documento que se pueden generar con plantillas (vehiculo, empleado, contacto, orden de compra, constancia, documento general...), con sus campos y formatos. Consultalo antes de generar un documento.",
        parameters: { type: "object", properties: {} },
      },
      run: (_args, actx) => guarded(async () => {
        const kinds = await access().usableKinds(callerOf(actx));
        return {
          total: kinds.length,
          tipos: kinds.map((kind) => ({
            key: kind.key, nombre: kind.label, modulo: kind.moduleKey ?? "general", formatos: kind.formats ?? ["docx", "xlsx", "pptx", "pdf"],
            campos: kind.freeTags ? "libres: se envian como values [{tag, value}]" : (kind.schema ?? []).map((field) => `${field.tag} (${field.label})`),
            requiereRegistro: !kind.freeTags,
          })),
        };
      }),
    },
    {
      name: "documents_templates",
      permission: "documents.templates.read",
      definition: {
        description: "Plantillas de documentos que la persona puede usar (propias y de la empresa), con formato, visibilidad y si estan publicadas. Opcional: kind para un solo tipo.",
        parameters: { type: "object", properties: { kind: { type: "string", description: "Key del tipo, de documents_kinds." } } },
      },
      run: (args, actx) => guarded(async () => {
        const out = await handlers()["runly.documents:templates.list"](callerOf(actx), { kind: args?.kind || undefined });
        return {
          total: out.items.length,
          plantillas: out.items.slice(0, 40).map((t) => ({ id: t.id, tipo: t.kind, nombre: t.name, formato: FORMAT_ES[t.format] ?? t.format, visibilidad: t.visibility === "personal" ? "personal" : "empresa", predeterminada: t.isDefault, publicada: t.published })),
        };
      }),
    },
  ];

  const generate = {
    key: "documents.document.generate",
    moduleKey: "runly.documents",
    operation: "create",
    label: "Generar documento desde una plantilla",
    permission: "documents.templates.read",
    description: "Genera un documento (Word, Excel, PowerPoint o PDF) con una plantilla y lo guarda en Archivos. Consulta antes documents_kinds y documents_templates. kind: key del tipo. sourceId: id del registro (vehiculo, empleado, contacto...) cuando el tipo lo requiere; para el documento general usa values [{tag, value}]. templateId opcional (si no, la predeterminada del tipo). output: 'pdf' para convertir a PDF cuando sea posible.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Key del tipo de documento." },
        sourceId: { type: "string", description: "ID del registro de origen." },
        values: { type: "array", items: { type: "object", properties: { tag: { type: "string" }, value: { type: "string" } }, required: ["tag", "value"] }, description: "Valores de las etiquetas cuando no hay registro de origen." },
        templateId: { type: "string", description: "ID de la plantilla (documents_templates)." },
        output: { type: "string", enum: ["native", "pdf"] },
        name: { type: "string", description: "Nombre del archivo resultante." },
      },
      required: ["kind"],
    },
    async prepare(args, actx) {
      return guarded(async () => {
        const caller = callerOf(actx);
        const kind = await access().usableKind(caller, String(args?.kind ?? ""));
        const values = pairs(args?.values);
        const hasValues = Object.keys(values).length > 0;
        if (!hasValues && !args?.sourceId) return { error: kind.freeTags ? "Indica los valores (values) del documento." : "Indica el registro de origen (sourceId)." };
        const { items } = await handlers()["runly.documents:templates.list"](caller, { kind: kind.key });
        let template = null;
        if (args?.templateId) {
          template = items.find((t) => t.id === args.templateId);
          if (!template) return { error: "No encontre esa plantilla entre las que puedes usar. Usa documents_templates." };
          if (!template.published) return { error: "Esa plantilla aun no esta publicada." };
        } else template = items.find((t) => t.isDefault && t.visibility === "company" && t.published) ?? null;
        const fields = [
          { label: "Tipo", value: kind.label },
          { label: "Plantilla", value: template ? `${template.name} (${FORMAT_ES[template.format] ?? template.format})` : "Formato estandar del tipo" },
          ...(args?.sourceId ? [{ label: "Registro", value: String(args.sourceId) }] : []),
          ...(hasValues ? [{ label: "Valores", value: Object.entries(values).map(([tag, value]) => `${tag}: ${value}`).join(" | ").slice(0, 400) }] : []),
          { label: "Salida", value: args?.output === "pdf" ? "PDF (si se puede convertir)" : "Mismo formato de la plantilla" },
        ];
        return {
          input: { kind: kind.key, sourceId: args?.sourceId || undefined, values: hasValues ? values : undefined, templateId: template?.id, output: args?.output === "pdf" ? "pdf" : "native", name: args?.name ? String(args.name).slice(0, 120) : undefined },
          preview: { title: "Generar documento", fields },
        };
      });
    },
    async execute(input, actx) {
      const file = await handlers()["runly.documents:documents.generate"](callerOf(actx), input);
      return { id: file.id, summary: `Documento generado: ${file.name}`, link: LINK(file.id) };
    },
  };

  return {
    moduleKey: "runly.documents",
    label: "Documentos",
    summary: "Plantillas de documentos: lista los tipos y las plantillas disponibles y genera un documento (Word, Excel, PowerPoint o PDF) desde un registro con confirmacion.",
    tools,
    actions: [generate],
    publicLookup: [],
  };
}
