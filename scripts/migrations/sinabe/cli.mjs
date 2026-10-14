#!/usr/bin/env node
// sinabe -> Runly migrator CLI (Stage A: census, synthetic).
//   node scripts/migrations/sinabe/cli.mjs census --dump <file.sql> [--listing <uploads.tsv>] --out <dir>
//   node scripts/migrations/sinabe/cli.mjs synthetic --out <dir> [--items 5000] [--seed 1] [--bytes-scale 0.001]
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { runCensus } from './census.mjs'
import { generateSynthetic } from './synthetic.mjs'

const USAGE = `Uso:
  cli.mjs census --dump <archivo.sql> [--listing <listado.tsv>] --out <carpeta>
  cli.mjs synthetic --out <carpeta> [--items 5000] [--seed 1] [--bytes-scale 0.001]`

const number = (value, name) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido para --${name}`)
  return n
}

export async function main(argv) {
  const [command, ...rest] = argv
  const { values } = parseArgs({
    args: rest,
    options: {
      dump: { type: 'string' }, listing: { type: 'string' }, out: { type: 'string' },
      items: { type: 'string' }, seed: { type: 'string' }, 'bytes-scale': { type: 'string' },
    },
    strict: true,
  })
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
      out: values.out,
      items: values.items ? number(values.items, 'items') : 5000,
      seed: values.seed ? number(values.seed, 'seed') : 1,
      bytesScale: values['bytes-scale'] ? number(values['bytes-scale'], 'bytes-scale') : 0.001,
    })
    console.log(`Datos sintéticos listos en ${values.out}.`)
    console.log(`  Inventarios: ${result.rows.Inventory}; archivos escritos: ${result.filesWritten} (${result.bytesWritten} bytes); ` +
      `faltantes a propósito: ${result.filesMissing}; huérfanos: ${result.filesOrphan}.`)
    console.log(`  Duración: ${result.ms} ms.`)
    return 0
  }
  console.error(USAGE)
  return 2
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }, (error) => {
    // Errors carry codes/messages only; never dump row data.
    console.error(`Error: ${error.message}`)
    process.exitCode = 1
  })
}
