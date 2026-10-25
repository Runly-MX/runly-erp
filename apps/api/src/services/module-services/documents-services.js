// Services of Runly Documents for automations and Builder modules: fill a
// template of any registered kind (company or Builder kinds) and list the
// templates a caller may use. Visibility rules match the Documents routes:
// company templates are usable by everyone allowed to use the kind, personal
// ones only by their owner; with no user (system calls from automations) only
// company templates are reachable and the admin grant is the authorization.
import { FORMAT_MIME } from '../../routes/documents/document-template-files.js'

const MAX_VALUES_JSON = 20_000

const isDocumentError = (error) => ['DocumentProviderError', 'DocumentTemplateServiceError'].includes(error?.name)

// `values` arrives as an object, or as JSON text when typed into an automation step.
export function parseValues(raw, ServiceError) {
  if (raw === undefined || raw === null) return undefined
  let value = raw
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw) } catch { throw new ServiceError('Los valores del documento deben ser un objeto JSON válido.', 422, 'invalid_values') }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > MAX_VALUES_JSON) {
    throw new ServiceError('Los valores del documento deben ser un objeto JSON de hasta 20 KB.', 422, 'invalid_values')
  }
  return value
}

// Shared by the services, MirAI and MCP. ctx: { companyId, system?, permissionKeys?, isAdmin? }.
export function createDocumentsAccess({ ServiceError, hub = null }) {
  const requireHub = () => {
    if (!hub) throw new ServiceError('Documentos no está disponible en esta instancia.', 503, 'documents_unavailable')
    return hub
  }
  const wrap = async (fn) => {
    try { return await fn() } catch (error) {
      if (isDocumentError(error)) throw new ServiceError(error.message, error.status, error.code)
      throw error
    }
  }

  // The kind must exist, belong to a module that is active for the company, and be usable by the caller.
  async function usableKind(ctx, key) {
    const documents = requireHub()
    const kind = documents.kinds.getKind(key)
    if (!kind) throw new ServiceError('Tipo de documento no encontrado.', 404, 'kind_not_found')
    if (kind.moduleKey && !kind.alwaysVisible) {
      const active = await documents.activeModules(ctx.companyId, [kind.moduleKey])
      if (!active.has(kind.moduleKey)) throw new ServiceError('Tipo de documento no encontrado.', 404, 'kind_not_found')
    }
    if (!ctx.system) await wrap(async () => documents.kinds.assertPermission(kind, { permissionKeys: ctx.permissionKeys ?? [], isAdmin: Boolean(ctx.isAdmin) }))
    return kind
  }

  async function usableKinds(ctx) {
    const out = []
    for (const kind of requireHub().kinds.listKinds()) {
      try { out.push(await usableKind(ctx, kind.key)) } catch { /* not usable for this caller */ }
    }
    return out
  }

  return { requireHub, wrap, usableKind, usableKinds }
}

export function createDocumentsHandlers({ prisma, ServiceError, hub = null }) {
  const { requireHub, wrap, usableKind, usableKinds } = createDocumentsAccess({ ServiceError, hub })

  return {
    'runly.documents:documents.generate': async (ctx, args) => {
      const documents = requireHub()
      const kind = await usableKind(ctx, args.kind)
      if (args.templateId) {
        const template = await prisma.documentTemplate.findFirst({
          where: { id: args.templateId, companyId: ctx.companyId, kind: kind.key, enabled: true },
          select: { visibility: true, ownerUserId: true },
        })
        const usable = template && ((template.visibility ?? 'company') === 'company' || (ctx.actorId && template.ownerUserId === ctx.actorId))
        if (!usable) throw new ServiceError('Plantilla no encontrada.', 404, 'template_not_found')
      }
      const values = parseValues(args.values, ServiceError)
      if (!values && !args.sourceId) throw new ServiceError('Indica el registro (sourceId) o los valores del documento.', 422, 'source_required')
      const result = await wrap(() => documents.engine.generate({
        companyId: ctx.companyId, actorId: ctx.actorId ?? null, kind: kind.key, templateId: args.templateId ?? undefined,
        sourceId: args.sourceId ?? undefined, data: values, title: args.name ?? undefined,
        output: args.output ?? 'native', trusted: Boolean(ctx.system), permissions: ctx.permissionKeys ?? [], isAdmin: Boolean(ctx.isAdmin),
      }))
      return {
        id: result.fileAssetId, name: result.fileName, mimeType: FORMAT_MIME[result.format] ?? 'application/octet-stream',
        sizeBytes: result.buffer.length, sourceEntityId: args.sourceEntityId ?? args.sourceId ?? null,
      }
    },

    'runly.documents:templates.list': async (ctx, args) => {
      const documents = requireHub()
      const kinds = args.kind ? [await usableKind(ctx, args.kind)] : await usableKinds(ctx)
      const items = []
      for (const kind of kinds) {
        const templates = await wrap(() => documents.fileTemplates.list({ companyId: ctx.companyId, kind: kind.key, viewerId: ctx.actorId ?? null }))
        for (const t of templates) {
          if (t.visibility === 'personal' && !ctx.actorId) continue
          items.push({ id: t.id, kind: kind.key, name: t.name, format: t.format, visibility: t.visibility, isDefault: Boolean(t.isDefault), published: Boolean(t.publishedVersionId) })
        }
      }
      return { items }
    },
  }
}
