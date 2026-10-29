// Renders the commands a rehearsal run EXECUTED (recorded by the harness, secrets already masked) as a document, with local
// paths, project names, ports and generated access-key ids replaced by placeholders so nothing machine-specific is published.
//   node scripts/rehearsal/render-commands.mjs --run=r2 --out=docs/deployment/BACKUP_RESTORE_REHEARSAL_COMMANDS.md
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const run = arg('run'), out = arg('out')
if (!run || !out) { console.error('usage: --run=<id> --out=<file>'); process.exit(2) }
const state = JSON.parse(await readFile(resolve('.artifacts/rehearsal', `run-${run}`, 'state.json'), 'utf8'))
const repo = resolve('.'), runDir = resolve('.artifacts/rehearsal', `run-${run}`)
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function sanitize(text, { repo, runDir, source, replica, minioPort }) {
  let result = text
  for (const [value, replacement] of [[runDir, '<ejecucion>'], [repo, '<repo>']]) result = result.replaceAll(value, replacement).replaceAll(value.replaceAll('\\', '/'), replacement)
  result = result.replace(/<(ejecucion|repo)>[^\s"']*/g, match => match.replaceAll('\\', '/'))
  if (source) result = result.replaceAll(source, '<proyecto-origen>')
  if (replica) result = result.replaceAll(replica, '<proyecto-replica>')
  if (minioPort) result = result.replaceAll(`host.docker.internal:${minioPort}`, 'host.docker.internal:<puerto-minio>')
  // Container addresses are random per run and JWTs are keys of a disposable stack: neither belongs in a document.
  result = result.replace(/\b(?!127\.0\.0\.1\b|0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip-contenedor>').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
  result = result.replaceAll('C:/Program Files/Git/bin/bash.exe', 'bash').replace(/127\.0\.0\.1:\d+:9000/g, '127.0.0.1:<puerto-minio>:9000')
  return result.replace(/(ACCESS_KEY_ID=)\S+/g, '$1<id>').replace(/(MINIO_ROOT_USER=)\S+/g, '$1<usuario>').replace(/rh[0-9a-f]{8}/g, '<usuario>').replace(/runly-rehearsal-(minio|api|worker|internal|prod-sim)-[0-9a-z]{8}/g, 'runly-rehearsal-$1-<token>')
}

const context = { repo, runDir, source: state.source?.name, replica: state.replica?.name, minioPort: state.minio?.port }
const groups = [
  ['Redaccion y filtrado de la configuracion (runbook B.2 y B.3)', /^runbook B\./],
  ['Destino S3 local (MinIO)', /^minio:/],
  ['Respaldo real de Runly (run-backup.sh)', /^backup: (complete run 1|database-only|complete run 2|integral)/],
  ['Listado y clasificacion de snapshots', /^(restic: (list|store|init)|recovery-cli: inspect)/],
  ['Extraccion y evaluacion con la CLI de recuperacion', /^recovery-cli: (extract|assess)/],
  ['Tabla de contenido del volcado', /^pg_restore --list/],
  ['Roles globales sin contrasenas (runbook B.4) y controles', /^pg_dumpall/],
  ['Restauracion de la base en la replica', /^pg_restore (--clean|into a scratch)/],
  ['Restauracion de Storage por S3', /^rclone copy storage\/runly-files/],
  ['Descifrado de un valor guardado con la clave original o con la nueva', /^decrypt/],
  ['Sondas de aislamiento y comprobaciones de la API recuperada', /^(probe|sign in)/],
  ['Fallos simulados', /^(backup: (interrupted|pg_dump killed|Storage file missing|database-only run for|database-only run \(the only)|restic (check|restore)|pg_restore of|verify-backup\.sh)/],
]
const lines = [`# Comandos ejecutados en el ensayo de respaldo y recuperacion`, '',
  `Generado por \`scripts/rehearsal/render-commands.mjs\` a partir del registro de la ejecucion \`${run}\`. Son los comandos que el arnes lanzo de verdad, con los secretos enmascarados (\`<secreto>\`) y las rutas locales, nombres de proyecto, puertos e identificadores de acceso generados sustituidos por marcadores. Solo se muestra la primera aparicion de cada tipo.`, '']
for (const [title, pattern] of groups) {
  // One entry per command SHAPE: the same command run against another bucket, mode or retention is shown once.
  const shape = entry => sanitize(entry.command, context).replace(/(BACKUP_S3_BUCKET=|BACKUP_COVERAGE_MODE=|BACKUP_RETENTION_DAYS=|--filter name=)\S+/g, '$1<valor>').replace(/\/storage\/[\w-]+ /g, '/storage/<bucket> ')
  const seen = new Set(), entries = state.commands.filter(entry => pattern.test(entry.label) && !seen.has(shape(entry)) && seen.add(shape(entry)))
  if (!entries.length) continue
  lines.push(`## ${title}`, '')
  for (const entry of entries) lines.push(`${entry.label}`, '', '```text', sanitize(entry.command, context), '```', '')
}
await writeFile(resolve(out), lines.join('\n'))
console.log(`wrote ${out}: ${lines.filter(line => line === '```text').length} commands`)
