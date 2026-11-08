// ERP E3a: importing an automation from the Marketplace.
//   inspect  -> risk report, nothing saved
//   prepare  -> the cleaned definition and its digest are kept server-side (consent target)
//   confirm  -> explicit consent (digest + exact service list) -> NEW automation, always paused
// The file only ever comes from the verified resource feed (marketplace-import-gate.js). The
// automation is created directly, never through system-automations-service.save(): save() would
// sync service grants for every service in use, which is consent the import must ask for
// explicitly. Only the services the person accepted are granted, in the same transaction that
// creates the paused automation and its audit entry. Nothing runs: no trigger, action, HTTP call,
// test, schedule, webhook token or listener is activated; activation stays a separate edit.
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { parseAutomationFile, riskSummary } from '@runly/module-compiler/automation-file'
import { normalizeAutomations, serviceStepsOf, validateSystemAutomation } from '@runly/module-compiler'
import { createAutomationHttpService } from '../automation-http-service.js'
import { SYSTEM_MODULE_KEY, MAX_SYSTEM_AUTOMATIONS } from '../system-automations-service.js'
import { MarketplaceImportError } from './marketplace-import-gate.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY = /^[a-z][a-z0-9_]{1,40}$/
// Cleaning removes people on purpose: those steps stay paused until someone completes them.
const NEEDS_CONFIGURATION = new Set(['AUTOMATION_ARG_REQUIRED'])
const STORED_ONLY = ['id', 'key', 'enabled', 'webhookToken', 'createdById', 'companyId', 'updatedAt', 'lastRun']

const confirmSchema = z.strictObject({
  definitionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  services: z.array(z.string().min(1).max(200)).max(100),
  acceptRisks: z.literal(true),
  key: z.string().regex(KEY).optional(),
})

// Stable JSON (sorted keys): the digest the consent is bound to.
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value)
export const definitionDigest = (definition) => createHash('sha256').update(canonical(definition)).digest('hex')
const sameList = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i])

const fail = (code, message, status = 409, details = null) => { throw new MarketplaceImportError(code, message, status, details) }

export function createAutomationImportService({ prisma, gate, http = createAutomationHttpService({ prisma }), now = () => new Date() }) {
  // Validation of a cleaned definition against THIS instance (services, HTTP allowlist).
  async function analyzeDefinition(definition) {
    const issues = validateSystemAutomation({ ...definition, key: 'importada' })
    const errors = issues.filter((d) => d.severity !== 'warning' && !NEEDS_CONFIGURATION.has(d.code)).map((d) => ({ code: d.code, path: d.path, message: d.message }))
    const needsConfiguration = issues.filter((d) => NEEDS_CONFIGURATION.has(d.code)).map((d) => ({ code: d.code, path: d.path, message: d.message }))
    const allowed = new Set((await http.getHosts()).map((h) => h.toLowerCase()))
    const httpHosts = riskSummary(definition).httpHosts
    for (const host of httpHosts) if (!allowed.has(host.toLowerCase())) errors.push({ code: 'AUTOMATION_HTTP_HOST_NOT_ALLOWED', path: 'steps', message: `El destino ${host} no está en la lista de destinos permitidos de esta instancia.` })
    const services = [...new Set(serviceStepsOf(definition).map((s) => s.service).filter(Boolean))].sort()
    const trigger = definition.trigger?.type ?? null
    const notes = []
    if (trigger === 'webhook') notes.push({ code: 'webhook_url_on_activation', message: 'La URL secreta del webhook se crea en esta empresa al activarla; no se importa ninguna.' })
    if (trigger === 'schedule' || trigger === 'date') notes.push({ code: 'schedule_on_activation', message: 'No se programa nada hasta que alguien la active.' })
    return { errors, needsConfiguration, services, httpHosts, trigger, notes }
  }

  // Bytes of the authentic package -> cleaned definition + risk report. Saves nothing.
  async function analyze(bytes) {
    const parsed = parseAutomationFile(bytes)
    if (!parsed.ok) return { blocked: true, definition: null, digest: null, report: { errors: parsed.errors.map((e) => ({ ...e, path: null })), needsConfiguration: [], services: [], httpHosts: [], removed: parsed.removed, fileRisk: null, notes: [], importsPaused: true } }
    const definition = Object.fromEntries(Object.entries(parsed.definition).filter(([k]) => !STORED_ONLY.includes(k)))
    const checked = await analyzeDefinition(definition)
    return {
      blocked: checked.errors.length > 0, definition, digest: definitionDigest(definition),
      // fileRisk: what the published file asked for; removed: what the cleanup took out before anything is stored.
      report: { label: definition.label, trigger: checked.trigger, stepCount: definition.steps?.length ?? 0, ...checked, removed: parsed.removed, fileRisk: parsed.riskSummary, importsPaused: true },
    }
  }

  const view = (row) => ({
    id: row.id, state: row.state, expiresAt: row.expires_at, source: row.source, report: row.report, definition: row.definition, definitionDigest: row.definition_digest, services: row.services,
    consentRequired: { definitionDigest: row.definition_digest, services: row.services, acceptRisks: true },
    ...(row.result ? { result: row.result, consent: row.consent } : {}),
  })
  async function find(companyId, actorId, id, db = prisma, lock = false) {
    if (!UUID.test(String(id)) || !companyId || !actorId) fail('AUTOMATION_IMPORT_NOT_FOUND', 'Importación no encontrada.', 404)
    const rows = lock ? await db.$queryRaw`SELECT * FROM marketplace_automation_import WHERE id=${id}::uuid AND company_id=${companyId}::uuid AND actor_id=${actorId}::uuid FOR UPDATE`
      : await db.$queryRaw`SELECT * FROM marketplace_automation_import WHERE id=${id}::uuid AND company_id=${companyId}::uuid AND actor_id=${actorId}::uuid`
    if (!rows[0]) fail('AUTOMATION_IMPORT_NOT_FOUND', 'Importación no encontrada.', 404)
    return rows[0]
  }

  async function inspect({ companyId, actorId, ref }) {
    const { bytes, resource, source } = await gate.download(ref, 'automation', { companyId, actorId })
    const analysis = await analyze(bytes)
    return { resource, source, blocked: analysis.blocked, report: analysis.report, definition: analysis.definition, definitionDigest: analysis.digest }
  }

  async function prepare({ companyId, actorId, ref }) {
    const { bytes, source } = await gate.download(ref, 'automation', { companyId, actorId })
    const analysis = await analyze(bytes)
    if (analysis.blocked) fail('AUTOMATION_IMPORT_BLOCKED', analysis.report.errors[0]?.message ?? 'La automatización no se puede importar en esta instancia.', 422, { report: analysis.report })
    const [{ pending }] = await prisma.$queryRaw`SELECT count(*)::int AS pending FROM marketplace_automation_import WHERE company_id=${companyId}::uuid AND actor_id=${actorId}::uuid AND state='prepared' AND expires_at>now()`
    if (pending >= 5) fail('AUTOMATION_IMPORT_QUOTA', 'Tienes importaciones pendientes. Confírmalas o cancélalas.', 429)
    const [row] = await prisma.$queryRaw`INSERT INTO marketplace_automation_import(company_id,actor_id,source,definition,definition_digest,services,report)
      VALUES(${companyId}::uuid,${actorId}::uuid,${JSON.stringify(source)}::jsonb,${JSON.stringify(analysis.definition)}::jsonb,${analysis.digest},${analysis.report.services}::text[],${JSON.stringify(analysis.report)}::jsonb) RETURNING *`
    return view(row)
  }

  const status = async ({ companyId, actorId, id }) => view(await find(companyId, actorId, id))

  async function cancel({ companyId, actorId, id }) {
    const row = await find(companyId, actorId, id)
    if (row.state === 'committed') fail('AUTOMATION_IMPORT_COMMITTED', 'La importación ya fue confirmada.')
    await prisma.$queryRaw`UPDATE marketplace_automation_import SET state='cancelled' WHERE id=${row.id}::uuid AND state='prepared' RETURNING id`
    return { cancelled: true }
  }

  function newKey(source) {
    const slug = String(source.resourceKey.split('.').slice(1).join('_')).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
    return `${/^[a-z]/.test(slug) ? slug : `mk_${slug}`.slice(0, 33)}_${randomBytes(3).toString('hex')}`.replace(/__+/g, '_')
  }

  async function confirm({ companyId, actorId, id, input }) {
    const consent = confirmSchema.parse(input)
    const prepared = await find(companyId, actorId, id)
    if (prepared.state === 'committed') {
      if (prepared.consent.definitionDigest !== consent.definitionDigest) fail('AUTOMATION_IMPORT_DIGEST_MISMATCH', 'La confirmación no corresponde a esta importación.')
      return prepared.result
    }
    if (prepared.state !== 'prepared' || new Date(prepared.expires_at).getTime() <= now().getTime()) fail('AUTOMATION_IMPORT_EXPIRED', 'La preparación caducó o fue cancelada. Vuelve a prepararla.')
    // Consent is bound to this exact cleaned definition and this exact list of services.
    if (definitionDigest(prepared.definition) !== prepared.definition_digest || consent.definitionDigest !== prepared.definition_digest) fail('AUTOMATION_IMPORT_DIGEST_MISMATCH', 'La automatización cambió desde que la revisaste. Revísala de nuevo.')
    if (!sameList(consent.services, prepared.services)) fail('AUTOMATION_IMPORT_CONSENT_MISMATCH', 'Acepta exactamente los servicios que la automatización necesita.', 409, { services: prepared.services })
    try { await gate.recheck(prepared.source) } catch (error) {
      if (error?.status === 409) await prisma.$queryRaw`UPDATE marketplace_automation_import SET state='cancelled' WHERE id=${prepared.id}::uuid AND state='prepared' RETURNING id`
      throw error
    }
    // The instance may have changed since the preparation (allowlist, available services).
    const checked = await analyzeDefinition(prepared.definition)
    if (checked.errors.length) fail('AUTOMATION_IMPORT_BLOCKED', checked.errors[0].message, 409, { errors: checked.errors })
    if (!sameList(checked.services, prepared.services)) fail('AUTOMATION_IMPORT_CONSENT_MISMATCH', 'Los servicios de la automatización cambiaron. Revísala de nuevo.')

    for (let attempt = 0; attempt < 3; attempt++) {
      const key = consent.key ?? newKey(prepared.source)
      const [normalized] = normalizeAutomations([{ ...prepared.definition, key, enabled: false }])
      const { key: _key, label, enabled: _enabled, ...definition } = normalized
      const outcome = await prisma.$transaction(async (db) => {
        const row = await find(companyId, actorId, id, db, true)
        if (row.state === 'committed') return { result: row.result }
        if (row.state !== 'prepared' || row.definition_digest !== consent.definitionDigest) fail('AUTOMATION_IMPORT_EXPIRED', 'La preparación ya no está disponible.')
        if (await db.systemAutomation.findUnique({ where: { companyId_key: { companyId, key } }, select: { id: true } })) return { taken: true }
        if ((await db.systemAutomation.count({ where: { companyId } })) >= MAX_SYSTEM_AUTOMATIONS) fail('AUTOMATION_LIMIT', `Máximo ${MAX_SYSTEM_AUTOMATIONS} automatizaciones por empresa.`)
        // Paused, no webhook token, owned by whoever confirmed: activation is a separate edit.
        const created = await db.systemAutomation.create({ data: { companyId, key, label, enabled: false, definition, webhookToken: null, createdById: actorId } })
        if (row.services.length) await db.moduleServiceGrant.createMany({ data: row.services.map((serviceKey) => ({ moduleKey: SYSTEM_MODULE_KEY, serviceKey, companyId, grantedBy: actorId })), skipDuplicates: true })
        const provenance = { resourceKey: row.source.resourceKey, version: row.source.version, releaseId: row.source.releaseId, sha256: row.source.sha256, publisher: row.source.publisher, catalogSequence: row.source.catalogSequence }
        const consentRecord = { definitionDigest: consent.definitionDigest, services: row.services, acceptRisks: true, actorId, companyId, at: now().toISOString() }
        await db.auditLog.create({ data: { companyId, actorId, moduleKey: SYSTEM_MODULE_KEY, entityType: 'SystemAutomation', entityId: created.id, action: 'automation.marketplace.imported', after: { key, label, enabled: false }, metadata: { marketplace: provenance, consent: consentRecord, importId: row.id } } })
        const result = { id: created.id, key, label, enabled: false, grantedServices: row.services, provenance }
        await db.$queryRaw`UPDATE marketplace_automation_import SET state='committed',consent=${JSON.stringify(consentRecord)}::jsonb,result=${JSON.stringify(result)}::jsonb,confirmed_at=now() WHERE id=${row.id}::uuid RETURNING id`
        return { result }
      })
      if (outcome.result) return outcome.result
      if (consent.key) fail('AUTOMATION_KEY_TAKEN', 'Ya existe una automatización con esa clave.')
    }
    fail('AUTOMATION_KEY_TAKEN', 'No se pudo asignar una clave libre. Reintenta.')
  }

  return { inspect, prepare, status, cancel, confirm, analyze }
}
