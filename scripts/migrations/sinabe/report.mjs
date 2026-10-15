// Run report: report.json + report.md (Spanish). PRIVACY: holds only counts,
// codes and sinabe internal ids - never serials, asset numbers, folios, names,
// e-mails, file names or signatures. Callers pass codes and ids only.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export class RunAborted extends Error {
  constructor(message) { super(message); this.code = 'RUN_ABORTED' }
}

const ENTITY_LABELS = {
  categories: 'Tipos', brands: 'Marcas', models: 'Modelos', locations: 'Ubicaciones', conditions: 'Condiciones', customFields: 'Campos personalizados',
  suppliers: 'Proveedores', employees: 'Colaboradores', purchaseOrders: 'Órdenes de compra', invoices: 'Facturas', invoiceFiles: 'Archivos de factura',
  items: 'Activos', itemFiles: 'Archivos de activos', relations: 'Relaciones activo-compra', custody: 'Resguardos', comments: 'Comentarios (bitácora)', projects: 'Proyectos', tasks: 'Tareas (hitos y subtareas)', events: 'Eventos', calendars: 'Calendarios',
}
const OUTCOMES = ['created', 'matched', 'skipped', 'conflict', 'failed']
const OUTCOME_LABELS = { created: 'Creados', matched: 'Existentes', skipped: 'Omitidos', conflict: 'Conflictos', failed: 'Fallidos' }
const DRY_LABELS = { created: 'A crear', matched: 'Existentes', skipped: 'Omitidos', conflict: 'Conflictos', failed: 'Fallidos' }
const ROLLBACK_LABELS = { created: 'Eliminados', matched: 'Conservados (existían antes)', skipped: 'Ya no existían', conflict: 'Conflictos', failed: 'Fallidos' }
const VERIFY_LABELS = { created: '-', matched: 'Correctos', skipped: 'Omitidos', conflict: 'Con diferencias', failed: 'Fallidos' }
const MAX_IDS_MD = 50

export function createReport({ command, mode, source, companyId, maxErrors = Infinity }) {
  const started = Date.now()
  const entities = {}
  const conflicts = {}
  const warnings = {}
  const pending = {}
  const files = { transferred: 0, bytes: 0, missing: 0, oversize: 0, fetchErrors: 0, sizeMismatches: 0, checksumMismatches: 0, alreadyStored: 0 }
  const phases = {}
  let errors = 0
  let aborted = null

  const entity = (name) => (entities[name] ??= Object.fromEntries(OUTCOMES.map((o) => [o, 0])))
  const report = {
    count(name, outcome, n = 1) { entity(name)[outcome] += n },
    // existingId (optional): the Runly row that causes the conflict, so the operator can open it.
    conflict(name, code, legacyId, existingId = null) {
      entity(name).conflict++
      const bucket = (conflicts[code] ??= { count: 0, ids: [] })
      bucket.count++
      if (legacyId != null) bucket.ids.push(existingId ? `${legacyId} -> runly:${existingId}` : String(legacyId))
    },
    warn(code, n = 1) { if (n) warnings[code] = (warnings[code] ?? 0) + n },
    warnAll(codes) { for (const code of codes ?? []) report.warn(code) },
    file(outcome, n = 1) { files[outcome] = (files[outcome] ?? 0) + n },
    pending(name, n) { pending[name] = n },
    phase(name, ms) { phases[name] = (phases[name] ?? 0) + ms },
    // Failure of one record: counted, coded, and checked against --max-errors.
    error(name, code, legacyId) {
      report.conflict(name, code, legacyId)
      entity(name).conflict--
      entity(name).failed++
      errors++
      if (errors > maxErrors) throw new RunAborted(`Se superó --max-errors (${maxErrors}).`)
    },
    abort(reason) { aborted = reason },
    get errors() { return errors },
    toJSON() {
      return {
        command, mode, source, companyId, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started,
        aborted, errors, entities, conflicts, warnings, files, pendingStageC: pending, phasesMs: phases,
      }
    },
  }
  return report
}

const table = (header, rows) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')

export function renderReportMd(data) {
  const labels = data.command === 'rollback' ? ROLLBACK_LABELS : data.command === 'verify' ? VERIFY_LABELS : data.mode === 'dry-run' ? DRY_LABELS : OUTCOME_LABELS
  const title = { migrate: 'Migración', verify: 'Verificación', rollback: 'Reversión' }[data.command] ?? data.command
  const lines = [`# ${title} sinabe → Runly (${data.mode === 'dry-run' ? 'simulación' : data.mode})`, '',
    `- Origen: \`${data.source}\``, `- Empresa: \`${data.companyId}\``, `- Inicio: ${data.startedAt}`, `- Duración: ${(data.durationMs / 1000).toFixed(1)} s`,
    `- Errores: ${data.errors}${data.aborted ? ` — **ABORTADA**: ${data.aborted}` : ''}`, '']
  const entityRows = Object.entries(data.entities).map(([name, c]) => [ENTITY_LABELS[name] ?? name, ...OUTCOMES.map((o) => c[o])])
  if (entityRows.length) lines.push('## Entidades', '', table(['Entidad', ...OUTCOMES.map((o) => labels[o])], entityRows), '')
  const f = data.files
  lines.push('## Archivos', '', table(['Concepto', 'Valor'], [
    ['Transferidos', f.transferred], ['Bytes transferidos', f.bytes], ['Ya guardados (omitidos)', f.alreadyStored], ['Faltantes en origen', f.missing],
    ['Exceden el límite', f.oversize], ['Errores de descarga', f.fetchErrors], ['Tamaño distinto al listado', f.sizeMismatches], ['Checksum distinto', f.checksumMismatches],
    ...(f.checked !== undefined ? [['Comparados por sha256', f.checked]] : []),
    ...(f.deleted !== undefined ? [['Eliminados (registro + almacenamiento)', f.deleted]] : []),
  ]), '')
  const conflictRows = Object.entries(data.conflicts).sort((a, b) => b[1].count - a[1].count)
  lines.push('## Conflictos y errores por código', '')
  if (!conflictRows.length) lines.push('Sin conflictos.', '')
  for (const [code, { count, ids }] of conflictRows) {
    lines.push(`### ${code} (${count})`, '', `IDs sinabe: ${ids.slice(0, MAX_IDS_MD).map((id) => `\`${id}\``).join(', ')}${ids.length > MAX_IDS_MD ? ` … (+${ids.length - MAX_IDS_MD}, ver report.json)` : ''}`, '')
  }
  const warningRows = Object.entries(data.warnings).sort((a, b) => b[1] - a[1])
  lines.push('## Advertencias por código', '', warningRows.length ? table(['Código', 'Cantidad'], warningRows) : 'Sin advertencias.', '')
  const pendingRows = Object.entries(data.pendingStageC ?? {})
  if (pendingRows.length) lines.push('## Pendiente etapa C', '', table(['Entidad', 'Registros'], pendingRows), '')
  const phaseRows = Object.entries(data.phasesMs ?? {})
  if (phaseRows.length) lines.push('## Tiempos por fase', '', table(['Fase', 'ms'], phaseRows), '')
  return `${lines.join('\n')}\n`
}

export async function writeReport(report, out, name = 'report') {
  const data = report.toJSON()
  await mkdir(out, { recursive: true })
  await writeFile(join(out, `${name}.json`), JSON.stringify(data, null, 2))
  await writeFile(join(out, `${name}.md`), renderReportMd(data))
  return data
}

// One-line Spanish summary for the console (aggregates only).
export function summarize(data) {
  const header = data.command === 'rollback' ? '(eliminados/conservados/ya no existían/conflictos/fallidos)' : '(creados/existentes/omitidos/conflictos/fallidos)'
  const parts = Object.entries(data.entities).map(([name, c]) => `${ENTITY_LABELS[name] ?? name}: ${c.created}/${c.matched}/${c.skipped}/${c.conflict}/${c.failed}`)
  return [`Duración ${(data.durationMs / 1000).toFixed(1)} s; errores ${data.errors}${data.aborted ? ' (ABORTADA)' : ''}.`,
    `  ${header} ${parts.join('; ')}`,
    data.command === 'rollback' ? `  Archivos eliminados: ${data.files.deleted ?? 0}.` : `  Archivos: ${data.files.transferred} transferidos (${data.files.bytes} bytes), ${data.files.alreadyStored} ya guardados, ${data.files.missing} faltantes, ${data.files.oversize} exceden límite, ${data.files.fetchErrors} errores.`].join('\n')
}
