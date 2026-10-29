// Docker-level helpers for the backup/restore rehearsal: a command log that masks every secret it has seen, a local MinIO
// as the only S3 destination, the real Runly backup job, restic, and the repository's own recovery CLI. Everything runs on
// this machine's Docker engine; the only network endpoint other than the disposable stacks is the local MinIO.
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { command, unusedPort } from '../../fixtures/studio/supabase-stack.mjs'

const MINIO_IMAGE = 'minio/minio:latest'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// A fetch whose timer keeps the event loop alive (AbortSignal.timeout does not, and the process would exit silently).
export async function fetchWithTimeout(url, ms = 1500) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), ms)
  try { return await fetch(url, { signal: controller.signal }) } finally { clearTimeout(timer) }
}

export class CommandLog {
  constructor() { this.secrets = new Set(); this.entries = [] }
  secret(...values) { for (const value of values) if (value && String(value).length >= 6) this.secrets.add(String(value)) }
  clean(text) {
    let output = String(text ?? '')
    for (const secret of [...this.secrets].sort((a, b) => b.length - a.length)) output = output.split(secret).join('<secreto>')
    return output
  }
  record(label, executable, args) { this.entries.push({ label, command: this.clean([executable, ...args].join(' ')) }) }
  // Runs through supabase-stack's command(); environment values never reach the log, only argv with secrets masked.
  async run(label, executable, args, options) {
    this.record(label, executable, args)
    try { return await command(executable, args, options) } catch (error) { throw Error(this.clean(error.message)) }
  }
  // Same, but captures the exit code instead of throwing (negative tests need the code and the text).
  async attempt(label, executable, args, { env, input, cwd, timeoutMs } = {}) {
    this.record(label, executable, args)
    return new Promise(resolve => {
      const child = spawn(executable, args, { env: env ?? process.env, cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      let output = ''
      child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
      // A command that keeps retrying (restic does so for a rejected signature) is cut off and reported as timed out, never as success.
      const timer = timeoutMs ? setTimeout(() => { child.kill(); resolve({ code: -9, timedOut: true, output: this.clean(output) }) }, timeoutMs) : null
      child.on('error', error => { clearTimeout(timer); resolve({ code: -1, output: this.clean(error.message) }) })
      child.on('close', code => { clearTimeout(timer); resolve({ code, output: this.clean(output) }) })
      child.stdin.end(input)
    })
  }
}

export async function startMinio({ log, directory, token }) {
  const name = `runly-rehearsal-minio-${token}`, user = `rh${randomBytes(4).toString('hex')}`, password = randomBytes(24).toString('hex'), port = await unusedPort()
  log.secret(password)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'minio.env'), `MINIO_ROOT_USER=${user}\nMINIO_ROOT_PASSWORD=${password}\n`, { mode: 0o600 })
  await log.run('minio: start a local S3 destination (loopback port only)', 'docker', ['run', '-d', '--name', name, '--env-file', join(directory, 'minio.env'), '-p', `127.0.0.1:${port}:9000`, MINIO_IMAGE, 'server', '/data'])
  let ready = false
  for (let attempt = 0; attempt < 80 && !ready; attempt++) { ready = await fetchWithTimeout(`http://127.0.0.1:${port}/minio/health/ready`).then(r => r.ok, () => false); if (!ready) await sleep(300) }
  if (!ready) throw Error('MINIO_NOT_READY')
  return minioHandle({ log, directory, name, user, password, port })
}

// Rebuilds the handle from saved state (the container keeps running between invocations of the rehearsal).
export async function minioHandle({ log, directory, name, user, password, port }) {
  log.secret(password)
  await writeFile(join(directory, 'mc.env'), `MC_HOST_t=http://${user}:${password}@host.docker.internal:${port}\n`, { mode: 0o600 })
  const mc = (label, args) => log.run(label, 'docker', ['run', '--rm', '--env-file', join(directory, 'mc.env'), '--entrypoint', '/usr/bin/mc', MINIO_IMAGE, ...args])
  return { name, user, password, port, containerEndpoint: `http://host.docker.internal:${port}`, mc, makeBucket: bucket => mc(`minio: create bucket ${bucket}`, ['mb', `t/${bucket}`]),
    async stop() { await command('docker', ['rm', '-f', name]).catch(() => {}) } }
}

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// restic against the rehearsal repository, with the credentials of THAT repository only.
export function resticFor(ctx, { bucket, password, user = ctx.minio.user, secret = ctx.minio.password }) {
  ctx.log.secret(password, secret)
  const envFile = join(ctx.work, `restic-${bucket}.env`)
  const write = writeFile(envFile, `RESTIC_REPOSITORY=s3:${ctx.minio.containerEndpoint}/${bucket}/${ctx.instanceId}\nRESTIC_PASSWORD=${password}\nAWS_ACCESS_KEY_ID=${user}\nAWS_SECRET_ACCESS_KEY=${secret}\nAWS_DEFAULT_REGION=us-east-1\n`, { mode: 0o600 })
  const base = ['run', '--rm', '--add-host', 'host.docker.internal:host-gateway', '--env-file', envFile, '--entrypoint', 'restic']
  return {
    async attempt(label, args, mounts = []) { await write; return ctx.log.attempt(label, 'docker', [...base, ...mounts, ctx.backupImage, '--no-cache', ...args]) },
    async run(label, args, mounts = []) { await write; return ctx.log.run(label, 'docker', [...base, ...mounts, ctx.backupImage, '--no-cache', ...args]) },
    async snapshots() {
      const result = await this.attempt(`restic: list snapshots of ${bucket}`, ['--no-lock', 'snapshots', '--json'])
      if (result.code !== 0) return { ok: false, output: result.output, snapshots: [] }
      return { ok: true, snapshots: JSON.parse(result.output.slice(result.output.indexOf('['))) }
    },
  }
}

export function coverageOf(snapshot) {
  const tags = snapshot.tags ?? []
  return { pending: tags.includes('runly-pending-v1'), coverage: tags.includes('runly-complete-v1') ? 'complete-declared' : tags.includes('runly-database-only-v1') ? 'database-only' : 'legacy-unknown' }
}

// The real job: apps/backup/run-backup.sh in the backup image, with the production-shaped sources mounted read-only.
// `envFile` must already be stripped of BACKUP_* / RESTIC_* (see filterEnv) so nothing of the "production" repository can leak in.
export async function runBackup(ctx, { label, bucket, password, mode = 'complete', configFile, retentionDays = 14, shims = {}, fastFail = false, user = ctx.minio.user, secret = ctx.minio.password }) {
  ctx.log.secret(password, secret, ctx.storageS3.secret)
  const shimMounts = []
  for (const [tool, file] of Object.entries(shims)) shimMounts.push('-v', `${file}:/usr/local/sbin/${tool}:ro`)
  const args = ['run', '--rm', '--network', ctx.source.network, '--add-host', 'host.docker.internal:host-gateway', '--env-file', ctx.envWithoutBackup,
    '-e', `BACKUP_S3_ENDPOINT=${ctx.minio.containerEndpoint}`, '-e', `BACKUP_S3_BUCKET=${bucket}`, '-e', `BACKUP_S3_ACCESS_KEY_ID=${user}`, '-e', `BACKUP_S3_SECRET_ACCESS_KEY=${secret}`,
    '-e', `RESTIC_PASSWORD=${password}`, '-e', `BACKUP_COVERAGE_MODE=${mode}`, '-e', `BACKUP_RETENTION_DAYS=${retentionDays}`,
    '-e', `BACKUP_STORAGE_S3_ENDPOINT=${ctx.storageS3.endpoint}`, '-e', `BACKUP_STORAGE_S3_ACCESS_KEY_ID=${ctx.storageS3.key}`, '-e', `BACKUP_STORAGE_S3_SECRET_ACCESS_KEY=${ctx.storageS3.secret}`, '-e', `BACKUP_STORAGE_S3_REGION=${ctx.storageS3.region}`,
    '-v', `${configFile}:/config-source/.env.external:ro`, '-v', `${ctx.source.modulesDirectory}:/modules-source:ro`, // fastFail only bounds the rclone retries so a deliberately broken source fails in seconds instead of minutes; the job itself is unchanged.
    ...(fastFail ? ['-e', 'RCLONE_RETRIES=1', '-e', 'RCLONE_LOW_LEVEL_RETRIES=2'] : []), ...shimMounts, ctx.backupImage, './run-backup.sh']
  const result = await ctx.log.attempt(label, 'docker', args)
  return { ok: result.code === 0, code: result.code, output: result.output }
}

// The repository's own recovery CLI (scripts/recovery/runly-recovery.mjs): read-only listing, extraction, assessment.
export async function recoveryConfig(ctx, { bucket, password, file, user = ctx.minio.user, secret = ctx.minio.password }) {
  ctx.log.secret(password, secret)
  await writeFile(file, [`BACKUP_S3_ENDPOINT=${ctx.minio.containerEndpoint}`, `BACKUP_S3_BUCKET=${bucket}`, `RUNLY_INSTANCE_ID=${ctx.instanceId}`,
    `BACKUP_S3_ACCESS_KEY_ID=${user}`, `BACKUP_S3_SECRET_ACCESS_KEY=${secret}`, `RESTIC_PASSWORD=${password}`, 'BACKUP_S3_REGION=us-east-1'].join('\n') + '\n', { mode: 0o600 })
  return file
}

export function recoveryCli(ctx, args, { timeoutMs } = {}) {
  // `assess` works on an extracted folder and takes no image.
  const image = args[0] === 'assess' ? [] : ['--image', ctx.backupImageId]
  return ctx.log.attempt(`recovery-cli: ${args[0]}`, process.execPath, ['scripts/recovery/runly-recovery.mjs', ...args, ...image], { cwd: process.cwd(), timeoutMs })
}

export { sleep, MINIO_IMAGE }
