// `migrate` command: dry-run (default) or --commit, in the spec order:
// catalogs + custom fields -> suppliers -> employees -> purchase orders ->
// invoices (+PDF/XML) -> items by batch (item, files, relations) -> custody
// records in date order -> audit logs as item comments -> projects (deadlines as
// tasks) -> calendar events (stage C; opt-in with --include-projects, never on --only pilots). Every step is idempotent through
// LegacyRef: a rerun resumes where a crash stopped.
import { readFile } from 'node:fs/promises'
import { loadSinabe } from './source.mjs'
import { readFilesListing } from './files-listing.mjs'
import { createFileFetcher } from './file-fetcher.mjs'
import { buildModel, buildScope } from './mapping/index.mjs'
import { parseDeliverersMap } from './mapping/people.mjs'
import { readOnlyIds, DEFAULT_BATCH_SIZE } from './plan.mjs'
import { createReport, writeReport, RunAborted } from './report.mjs'
import { createRunlyContext, assertTarget } from './runly-context.mjs'
import { migrateCatalogs } from './migrate-catalogs.mjs'
import { migrateSuppliers, migrateEmployees } from './migrate-people.mjs'
import { migratePurchaseOrders, migrateInvoices } from './migrate-purchases.mjs'
import { migrateItemBatch } from './migrate-items.mjs'
import { migrateProjects, migrateEvents } from './migrate-projects.mjs'
import { custodyCandidates, migrateCustody, migrateComments } from './migrate-custody.mjs'

export const DEFAULT_SOURCE = 'sinabe'
export const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024

export function createFetcherFromOptions({ filesDir, filesBaseUrl, rate = 0, pauseMs = 0 }) {
  if (filesDir) return createFileFetcher({ mode: 'local', dir: filesDir, bytesPerSecond: rate, pauseMs })
  if (filesBaseUrl) return createFileFetcher({ mode: 'http', baseUrl: filesBaseUrl, bytesPerSecond: rate, pauseMs, concurrency: 1 })
  return null
}

// Shared by migrate / verify / rollback: source, listing, Runly context.
export async function openRun(options, { needSource = true, needStorage = true } = {}) {
  const sourceName = String(options.source ?? DEFAULT_SOURCE).trim()
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  const sinabe = needSource ? await loadSinabe(options.dump) : null
  const model = sinabe ? buildModel(sinabe, { timeZone: options.timeZone }) : null
  const listing = options.listing ? (await readFilesListing(options.listing)).files : null
  const ctx = await createRunlyContext({ source: sourceName, maxFileBytes, needStorage })
  await assertTarget(ctx.prisma, { companyId: options.company, actorId: options.actor })
  return {
    ...ctx, model, listing, sourceName, maxFileBytes,
    companyId: options.company, actorId: options.actor ?? null,
    refs: ctx.toolkit.refs.bind(options.company, sourceName),
    filesDir: options.filesDir ?? null,
    fetcher: createFetcherFromOptions(options),
  }
}

const timed = async (run, name, fn) => {
  const started = Date.now()
  try { return await fn() } finally { run.report.phase(name, Date.now() - started) }
}

export async function runMigrate(options) {
  const commit = Boolean(options.commit)
  if (!options.dump) throw new Error('migrate: --dump es obligatorio')
  if (!options.company) throw new Error('migrate: --company es obligatorio')
  if (commit && !options.actor) throw new Error('migrate --commit: --actor es obligatorio')
  if (commit && !options.filesDir && !options.filesBaseUrl) throw new Error('migrate --commit: indica --files-dir o --files-base-url')
  const report = createReport({ command: 'migrate', mode: commit ? 'commit' : 'dry-run', source: options.source ?? DEFAULT_SOURCE, companyId: options.company, maxErrors: options.maxErrors ?? Infinity })
  const run = await openRun(options, { needStorage: commit })
  run.commit = commit
  run.report = report
  run.deliverers = parseDeliverersMap(options.deliverersMap ? JSON.parse(await readFile(options.deliverersMap, 'utf8')) : null)
  const log = options.log ?? (() => {})
  try {
    const scope = buildScope(run.model, await readOnlyIds(options.only))
    if (scope.unknownOnly) report.warn('ONLY_ID_NOT_IN_DUMP', scope.unknownOnly)
    const disabledCustody = run.model.source.custodyRecords.length - run.model.custodyRecords.length
    if (disabledCustody) { report.count('custody', 'skipped', disabledCustody); report.warn('CUSTODY_DISABLED_OR_UNKNOWN_STATUS', disabledCustody) }
    log(`Alcance: ${scope.items.length} activos, ${scope.orderIds.size} OC, ${scope.invoiceIds.size} facturas (${commit ? 'COMMIT' : 'simulación'}).`)

    const catalogs = await timed(run, 'catalogos', () => migrateCatalogs(run))
    const supplierIds = await timed(run, 'proveedores', () => migrateSuppliers(run, scope))
    // Receivers of the custody records this run can complete (items in scope or already migrated).
    const custodyInventoryIds = [...new Set(run.model.custodyRecords.flatMap((r) => (run.model.custodyItemsByRecord.get(r.id) ?? []).map((row) => row.inventoryId)))]
    const priorItems = await run.refs.findMany('inv_item', custodyInventoryIds)
    const expected = new Map(priorItems)
    for (const id of scope.itemIds) if (!expected.has(id)) expected.set(id, `dry:item:${id}`)
    // --skip-custody: no resguardos and therefore no employees are imported (they are only needed as
    // custody receivers). Create the employees by hand, then rerun without the flag: whatever matches
    // by employee number, e-mail or exact name is reused.
    const skipCustody = Boolean(options.skipCustody)
    const receivers = skipCustody ? [] : custodyCandidates(run.model, expected, scope.itemIds).filter((c) => c.state === 'eligible').map((c) => c.record.receiverId)
    const employees = skipCustody ? new Map() : await timed(run, 'colaboradores', () => migrateEmployees(run, receivers))
    const orderIds = await timed(run, 'ordenes', () => migratePurchaseOrders(run, scope, supplierIds))
    const invoiceIds = await timed(run, 'facturas', () => migrateInvoices(run, scope, supplierIds, orderIds))

    const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE)
    const itemIds = new Map()
    const batches = Math.ceil(scope.items.length / batchSize)
    for (let start = 0, index = 1; start < scope.items.length; start += batchSize, index++) {
      const batch = await timed(run, 'activos', () => migrateItemBatch(run, scope.items.slice(start, start + batchSize), catalogs, { invoices: invoiceIds, orders: orderIds }))
      for (const [legacyId, id] of batch) itemIds.set(legacyId, id)
      if (commit || index % 20 === 0 || index === batches) log(`  Lote ${index}/${batches}: ${itemIds.size} activos procesados; errores ${report.errors}.`)
      if (commit && run.fetcher && index < batches) await run.fetcher.pause()
    }

    const known = new Map(await run.refs.findMany('inv_item', custodyInventoryIds))
    if (!commit) for (const [legacyId, id] of itemIds) if (!known.has(legacyId)) known.set(legacyId, id)
    if (skipCustody) report.pending('resguardos', run.model.source.custodyRecords.length)
    else await timed(run, 'resguardos', () => migrateCustody(run, custodyCandidates(run.model, known, scope.itemIds), known, employees))
    await timed(run, 'comentarios', () => migrateComments(run, itemIds))

    const s = run.model.source
    if (options.only || !options.includeProjects) {
      for (const [name, rows] of Object.entries({ proyectos: s.projects, hitos: s.deadlines, tareas: s.deadlineTasks, eventos: s.events })) report.pending(name, rows.length)
    } else {
      await timed(run, 'proyectos', () => migrateProjects(run))
      await timed(run, 'eventos', () => migrateEvents(run))
    }
  } catch (error) {
    if (!(error instanceof RunAborted)) report.abort(`Error inesperado (${error?.code ?? error?.name ?? 'Error'})`)
    else report.abort(error.message)
    if (!(error instanceof RunAborted)) options.onUnexpected?.(error)
  } finally {
    await run.close()
  }
  const data = await writeReport(report, options.out ?? '.', commit ? 'report' : 'report-dry-run')
  return data
}
