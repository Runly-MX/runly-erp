import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { CommandLog, minioHandle } from '../lib/backup-flow.mjs'
import { command } from '../../fixtures/studio/supabase-stack.mjs'

export const GIT_BASH = process.env.RUNLY_BASH ?? (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash')
export const rand = bytes => randomBytes(bytes).toString('hex')

export async function createContext(args) {
  const runId = args.run ?? `${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}-${rand(2)}`
  const runDir = resolve('.artifacts/rehearsal', `run-${runId}`)
  const work = join(runDir, 'work')
  await mkdir(work, { recursive: true })
  const stateFile = join(runDir, 'state.json')
  const state = existsSync(stateFile) ? JSON.parse(await readFile(stateFile, 'utf8')) : { runId, checks: [], commands: [], secrets: [], notes: [] }
  const log = new CommandLog()
  log.entries = state.commands; log.secret(...state.secrets)
  const images = { api: args['api-image'], worker: args['worker-image'], backup: args['backup-image'] }
  for (const [kind, image] of Object.entries(images)) if (!image) throw Error(`--${kind}-image is required`)
  const backupImageId = (await command('docker', ['image', 'inspect', '--format', '{{.Id}}', images.backup])).trim()
  const ctx = { runId, runDir, work, stateFile, state, log, args, images, backupImage: images.backup, backupImageId, instanceId: 'rehearsal-source' }
  if (state.minio) ctx.minio = await minioHandle({ log, directory: work, ...state.minio })
  return ctx
}

export async function save(ctx) {
  ctx.state.commands = ctx.log.entries
  await writeFile(ctx.stateFile, JSON.stringify(ctx.state, null, 2), { mode: 0o600 })
}

export function addSecret(ctx, ...values) {
  ctx.log.secret(...values)
  for (const value of values) if (value && String(value).length >= 6 && !ctx.state.secrets.includes(String(value))) ctx.state.secrets.push(String(value))
}

export function record(ctx, id, title, ok, detail = '', { finding = false } = {}) {
  const text = ctx.log.clean(String(detail)).slice(0, 700)
  ctx.state.checks = ctx.state.checks.filter(check => check.id !== id)
  ctx.state.checks.push({ id, title, ok: Boolean(ok), detail: text, ...(finding ? { finding: true } : {}) })
  console.log(`${ok ? 'PASS' : finding ? 'FINDING' : 'FAIL'} ${id} - ${title}${text ? ` :: ${text.split('\n')[0].slice(0, 220)}` : ''}`)
}

// Runs one check; an exception is a failed check (with its message), never a crash that hides the rest.
export async function expect(ctx, id, title, fn, options) {
  try { record(ctx, id, title, true, (await fn()) ?? '', options) } catch (error) { record(ctx, id, title, false, error.message, options) }
}

export function note(ctx, text) { ctx.state.notes.push(ctx.log.clean(text)); console.log(`NOTE ${text.split('\n')[0]}`) }

// The redaction and filtering commands are taken from the runbook text itself, so the document that operators follow is
// exactly what this rehearsal executes.
export async function runbookCommand(pattern) {
  const text = (await readFile('docs/deployment/EXTERNAL_BACKUP_ACQUISITION_RUNBOOK.md', 'utf8')).replaceAll('\r\n', '\n')
  const match = pattern.exec(text)
  if (!match) throw Error(`RUNBOOK_COMMAND_NOT_FOUND: ${pattern}`)
  return match[0]
}
