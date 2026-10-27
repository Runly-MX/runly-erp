import { readFileSync, existsSync, mkdirSync, writeFileSync, lstatSync, unlinkSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

export const INSTALLER_CONTRACT = 'studio-realtime-1'
export function getUserComposeOverrides(cwd, mode) {
  return ['docker-compose.override.yml', `docker-compose.${mode}.override.yml`].filter(file => existsSync(join(cwd, file))).flatMap(file => ['-f', join(cwd, file)])
}
export function externalMigrationNetwork(envText, env = process.env) {
  const stored = /^RUNLY_MIGRATION_NETWORK=(.*)$/m.exec(envText)?.[1]?.trim()
  const network = env.RUNLY_MIGRATION_NETWORK || stored
  if (!network) return []
  if (!/^[a-zA-Z0-9_.-]+$/.test(network)) throw Error('INSTALLER_MIGRATION_NETWORK_INVALID')
  return ['--network', network]
}
export function resolveComposeMigrationNetwork({ cwd, composeArgs, env = process.env, spawn = spawnSync }) {
  const result = spawn('docker', ['compose', ...composeArgs, 'config', '--format', 'json'], { cwd, env, encoding: 'utf8', shell: false })
  if (result.error || result.status !== 0) throw Error('INSTALLER_COMPOSE_NETWORK_UNRESOLVED')
  const config = JSON.parse(result.stdout)
  const key = Object.keys(config.services?.['supabase-db']?.networks ?? {})[0]
  const network = config.networks?.[key]?.name
  if (!network || !/^[a-zA-Z0-9_.-]+$/.test(network)) throw Error('INSTALLER_COMPOSE_NETWORK_UNRESOLVED')
  return ['--network', network]
}
const groups = [
  ['RUNLY_API_LOCAL_IMAGE', 'ATLAS_API_LOCAL_IMAGE'], ['RUNLY_WORKER_LOCAL_IMAGE', 'ATLAS_WORKER_LOCAL_IMAGE'], ['RUNLY_WEB_LOCAL_IMAGE', 'ATLAS_WEB_LOCAL_IMAGE'],
  ['RUNLY_API_IMAGE', 'ATLAS_API_IMAGE'], ['RUNLY_WORKER_IMAGE', 'ATLAS_WORKER_IMAGE'], ['RUNLY_WEB_EXTERNAL_IMAGE', 'ATLAS_WEB_EXTERNAL_IMAGE'],
  ['LIVEKIT_IMAGE'], ['LIVEKIT_REDIS_IMAGE'], ['LIVEKIT_CADDY_IMAGE'], ['LIVEKIT_EGRESS_IMAGE'], ['RUNLY_TRANSCRIBER_IMAGE'], ['RUNLY_TTS_IMAGE'], ['RUNLY_BACKUP_IMAGE'],
]
export function applyStoredImageSelections({ cwd, mode, env = process.env }) {
  const read = file => {
    if (!existsSync(file)) return {}
    return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => {
      const i = l.indexOf('='), value = l.slice(i + 1).trim()
      return [l.slice(0, i), value.replace(/^(["'])(.*)\1$/, '$2')]
    }))
  }
  const stored = { ...read(join(cwd, '.env')), ...read(join(cwd, `.env.${mode}`)) }
  for (const keys of groups) {
    if (keys.some(key => env[key])) continue
    const selected = keys.find(key => stored[key])
    if (selected) env[selected] = stored[selected]
  }
}

export function assertInstallerReady(cwd) {
  if (existsSync(join(cwd, '.runly-installer/update.lock'))) throw Error('INSTALLER_UPDATE_IN_PROGRESS: finish or recover the script update before setup')
  if (existsSync(join(cwd, '.runly-installer/journal.json'))) throw Error('INSTALLER_UPDATE_RECOVERY_REQUIRED: rerun the updater before setup; an interrupted script update is pending')
  const file = join(cwd, '.runly-installer/state.json')
  if (existsSync(file)) {
    const state = JSON.parse(readFileSync(file, 'utf8'))
    if (state.contract !== INSTALLER_CONTRACT) throw Error('INSTALLER_STATE_INCOMPATIBLE')
  }
}

export function acquireInstallerDeployment(cwd) {
  assertInstallerReady(cwd)
  const directory = join(cwd, '.runly-installer'), lock = join(directory, 'deploy.lock')
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) throw Error('INSTALLER_SYMLINK_REFUSED')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (existsSync(lock)) {
    if (lstatSync(lock).isSymbolicLink()) throw Error('INSTALLER_SYMLINK_REFUSED')
    const pid = Number(readFileSync(lock, 'utf8'))
    if (!Number.isSafeInteger(pid) || pid < 1) throw Error('INSTALLER_LOCK_INVALID')
    try { process.kill(pid, 0); throw Error('INSTALLER_DEPLOYMENT_IN_PROGRESS') } catch (error) { if (error.code !== 'ESRCH') throw error }
    unlinkSync(lock)
  }
  const fd = openSync(lock, 'wx', 0o600)
  writeFileSync(fd, String(process.pid)); closeSync(fd)
  if (existsSync(join(directory, 'update.lock'))) { unlinkSync(lock); throw Error('INSTALLER_UPDATE_IN_PROGRESS') }
  return () => { if (existsSync(lock) && readFileSync(lock, 'utf8') === String(process.pid)) unlinkSync(lock) }
}

export function verifyRuntimeImages({ cwd, mode, images, spawn = spawnSync }) {
  const pinned = {}, selected = {}
  for (const [kind, image] of Object.entries(images)) {
    const result = spawn('docker', ['image', 'inspect', image], { cwd, encoding: 'utf8', shell: false })
    if (result.error || result.status !== 0) throw Error(`INSTALLER_IMAGE_UNAVAILABLE: ${kind}`)
    const [metadata] = JSON.parse(result.stdout)
    if (metadata.Config?.Labels?.['io.runly.installer.contract'] !== INSTALLER_CONTRACT) throw Error(`INSTALLER_IMAGE_INCOMPATIBLE: ${kind}; publish/select images with contract ${INSTALLER_CONTRACT} before migrating`)
    if (!/^sha256:[a-f0-9]{64}$/.test(metadata.Id)) throw Error('INSTALLER_IMAGE_ID_INVALID')
    pinned[kind] = metadata.Id
    selected[kind] = { reference: image, id: metadata.Id }
  }
  mkdirSync(join(cwd, '.runly-installer'), { recursive: true, mode: 0o700 })
  writeFileSync(join(cwd, '.runly-installer/images.json'), JSON.stringify({ contract: INSTALLER_CONTRACT, mode, images: selected }, null, 2), { mode: 0o600 })
  return pinned
}
