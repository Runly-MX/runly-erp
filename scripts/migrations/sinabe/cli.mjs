#!/usr/bin/env node
// sinabe -> Runly migrator CLI. Runly commands need the API env:
//   node --env-file=.env scripts/migrations/sinabe/cli.mjs <comando> ...
// See README.md (same folder) for the operator runbook.
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { runCensus } from './census.mjs'
import { generateSynthetic } from './synthetic.mjs'
import { runPlan } from './plan.mjs'
import { runMigrate, DEFAULT_MAX_FILE_BYTES } from './migrate.mjs'
import { runVerify } from './verify.mjs'
import { runRollback } from './rollback.mjs'
import { summarize } from './report.mjs'
import { runTargets } from './targets.mjs'
import { runWipe } from './wipe.mjs'

const USAGE = `Uso:
  cli.mjs census    --dump <archivo.sql> [--listing <listado.tsv>] --out <carpeta>
  cli.mjs synthetic --out <carpeta> [--items 5000] [--seed 1] [--bytes-scale 0.001]
  cli.mjs plan      --dump <archivo.sql> [--listing <listado.tsv>] [--batch-size 50] [--only <ids.txt>] --out <carpeta>
  cli.mjs migrate   --dump <archivo.sql> --company <uuid> [--actor <perfil>] [--listing <listado.tsv>]
                    [--files-dir <carpeta> | --files-base-url <url>] [--dry-run | --commit] [--source sinabe]
                    [--batch-size 50] [--only <ids.txt>] [--rate <bytes/s>] [--pause-ms <ms>] [--max-errors <n>]
                    [--deliverers-map <correo-perfil.json>] [--include-projects] [--skip-custody] [--max-file-mb 50] [--timezone America/Mexico_City] --out <carpeta>
  cli.mjs verify    --dump <archivo.sql> --company <uuid> [--listing ...] [--files-dir ... | --files-base-url ...] [--source sinabe] --out <carpeta>
  cli.mjs wipe      --company <uuid> [--commit --confirm <uuid>] [--allow-many]   (borra inventario y compras de la empresa; sin --commit solo cuenta)
  cli.mjs targets   (lista las empresas y perfiles de la instancia a la que apunta el entorno; solo lectura)
  cli.mjs rollback  --company <uuid> [--source sinabe] [--only <ids.txt> --dump <archivo.sql>] --out <carpeta>`

const number = (value, name) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido para --${name}`)
  return n
}
const opt = (values, name, fallback = undefined) => (values[name] !== undefined ? number(values[name], name) : fallback)

const OPTIONS = {
  dump: { type: 'string' }, listing: { type: 'string' }, out: { type: 'string' },
  items: { type: 'string' }, seed: { type: 'string' }, 'bytes-scale': { type: 'string' },
  'files-dir': { type: 'string' }, 'files-base-url': { type: 'string' }, company: { type: 'string' }, actor: { type: 'string' },
  source: { type: 'string' }, 'batch-size': { type: 'string' }, only: { type: 'string' }, rate: { type: 'string' },
  'pause-ms': { type: 'string' }, 'max-errors': { type: 'string' }, 'deliverers-map': { type: 'string' },
  'max-file-mb': { type: 'string' }, timezone: { type: 'string' }, commit: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
  debug: { type: 'boolean' }, 'include-projects': { type: 'boolean' }, 'skip-custody': { type: 'boolean' }, confirm: { type: 'string' }, 'allow-many': { type: 'boolean' },
}

function runOptions(values) {
  if (values.commit && values['dry-run']) throw new Error('Usa --dry-run o --commit, no ambos.')
  return {
    dump: values.dump, listing: values.listing ?? null, out: values.out ?? '.',
    filesDir: values['files-dir'] ?? null, filesBaseUrl: values['files-base-url'] ?? null,
    company: values.company, actor: values.actor ?? null, source: values.source ?? 'sinabe',
    batchSize: opt(values, 'batch-size'), only: values.only ?? null, rate: opt(values, 'rate', 0), pauseMs: opt(values, 'pause-ms', 0),
    maxErrors: opt(values, 'max-errors', Infinity), deliverersMap: values['deliverers-map'] ?? null,
    maxFileBytes: values['max-file-mb'] ? number(values['max-file-mb'], 'max-file-mb') * 1024 * 1024 : DEFAULT_MAX_FILE_BYTES,
    timeZone: values.timezone, commit: Boolean(values.commit), includeProjects: Boolean(values['include-projects']), skipCustody: Boolean(values['skip-custody']), confirm: values.confirm ?? null, allowMany: Boolean(values['allow-many']),
    log: (line) => console.log(line),
    onUnexpected: values.debug ? (error) => console.error(error) : null,
  }
}

export async function main(argv) {
  const [command, ...rest] = argv
  const { values } = parseArgs({ args: rest, options: OPTIONS, strict: true })
  if (command === 'census') {
    const census = await runCensus({ dump: values.dump, listing: values.listing ?? null, out: values.out })
    const files = census.archivos.listado
    console.log(`Censo listo en ${values.out} (census.json, census.md).`)
    console.log(`  Inventarios: ${census.conteos.inventories}; migraciones aplicadas: ${census.esquema.migracionesAplicadas}; ` +
      `tablas faltantes: ${census.esquema.tablasFaltantes.length}.`)
    if (files) console.log(`  Archivos en disco: ${files.archivos}; faltantes: ${files.referenciadosFaltantes}; huérfanos: ${files.huerfanos}.`)
    console.log(`  Duración: ${census.duracionMs.total} ms (lectura del dump ${census.duracionMs.lecturaDump} ms).`)
    return 0
  }
  if (command === 'synthetic') {
    if (!values.out) throw new Error('synthetic: --out es obligatorio')
    const result = await generateSynthetic({
      out: values.out, items: opt(values, 'items', 5000), seed: opt(values, 'seed', 1), bytesScale: opt(values, 'bytes-scale', 0.001),
    })
    console.log(`Datos sintéticos listos en ${values.out}.`)
    console.log(`  Inventarios: ${result.rows.Inventory}; archivos escritos: ${result.filesWritten} (${result.bytesWritten} bytes); ` +
      `faltantes a propósito: ${result.filesMissing}; huérfanos: ${result.filesOrphan}.`)
    console.log(`  Duración: ${result.ms} ms.`)
    return 0
  }
  if (command === 'plan') {
    const o = runOptions(values)
    const plan = await runPlan({ dump: o.dump, listing: o.listing, only: o.only, batchSize: o.batchSize, out: o.out, maxFileBytes: o.maxFileBytes, timeZone: o.timeZone })
    const t = plan.totals
    console.log(`Plan listo en ${o.out} (plan.json, batches/batch-NNN.txt).`)
    console.log(`  Activos: ${t.items} en ${plan.batches.length} lotes de ${plan.batchSize}; OC: ${plan.purchaseOrders}; facturas: ${plan.invoices}.`)
    if (plan.needed) console.log(`  Archivos que la migración completa necesita: ${plan.needed.files} (lista en files-needed.txt). Piloto: ${plan.pilot.items} activos, ${plan.pilot.files} archivos.`)
    console.log(`  Archivos: ${t.files} (${t.bytes} bytes); faltantes: ${t.missing}; exceden límite: ${t.oversize}; sin tamaño: ${t.unknownSize}.`)
    if (t.unknownOnly) console.log(`  Aviso: ${t.unknownOnly} ids de --only no están en el dump.`)
    console.log(`  Duración: ${plan.ms} ms.`)
    return 0
  }
  if (command === 'migrate') {
    const data = await runMigrate(runOptions(values))
    console.log(`${data.mode === 'commit' ? 'Migración' : 'Simulación'} terminada; reporte en ${values.out ?? '.'}.`)
    console.log(summarize(data))
    return data.aborted ? 1 : 0
  }
  if (command === 'verify') {
    const data = await runVerify(runOptions(values))
    const diffs = Object.values(data.conflicts).reduce((sum, c) => sum + c.count, 0)
    console.log(`Verificación terminada; reporte en ${values.out ?? '.'} (verify.md). Diferencias: ${diffs}.`)
    for (const [code, { count }] of Object.entries(data.conflicts)) console.log(`  ${code}: ${count}`)
    return diffs ? 1 : 0
  }
  if (command === 'rollback') {
    const data = await runRollback(runOptions(values))
    console.log(`Reversión terminada; reporte en ${values.out ?? '.'} (rollback.md).`)
    console.log(summarize(data))
    return data.errors ? 1 : 0
  }
  if (command === 'wipe') return runWipe(runOptions(values), (line) => console.log(line))
  if (command === 'targets') return runTargets((line) => console.log(line))
  console.error(USAGE)
  return 2
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }, (error) => {
    // Errors carry codes/messages only; never dump row data.
    const prismaError = /^PrismaClient/.test(error?.name ?? '')
    console.error(prismaError ? `Error de base de datos (${error.code ?? error.name}).` : `Error: ${error.message}`)
    if (process.argv.includes('--debug')) console.error(error)
    process.exitCode = 1
  })
}
