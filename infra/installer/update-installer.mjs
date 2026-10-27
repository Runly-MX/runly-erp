#!/usr/bin/env node
// Self-contained verified downloader. No npm install, application secrets or DB.
import * as fs from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repository = 'Runly-MX/runly-erp'
const contract = 'studio-realtime-1'
export const canonical = value => Buffer.from(value.toString('utf8').replaceAll('\r\n', '\n'))
export const sha256 = value => createHash('sha256').update(value).digest('hex')
const gitBlob = value => createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex')
const allowed = file => /^(?:(?:lib|supabase)\/[a-zA-Z0-9_./-]+|[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:mjs|json|sh|ps1|yml)|\.env\.(?:local|external)\.example)$/.test(file) && !file.split('/').some(p => !p || p === '..' || p === '.')
function isLink(file) { try { return fs.lstatSync(file).isSymbolicLink() } catch (error) { if (error.code !== 'ENOENT') throw error; return false } }
function safe(root, file, internal = false) {
  if (!(allowed(file) || internal && file === '.runly-installer/state.json')) throw Error('INSTALLER_UNSAFE_PATH')
  let current = root
  for (const part of file.split('/')) {
    current = join(current, part)
    if (isLink(current)) throw Error(`INSTALLER_SYMLINK_REFUSED: ${file}`)
  }
  return current
}
const readJson = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
function restore(root, area) {
  const journal = readJson(join(area, 'journal.json'))
  if (!journal) return
  for (let i = journal.length - 1; i >= 0; i--) {
    const item = journal[i], target = safe(root, item.file, true)
    const metadata = item.file === '.runly-installer/state.json'
    if (!metadata && fs.existsSync(target)) {
      if (fs.lstatSync(target).isDirectory()) {
        if (item.emptyDirectory && !fs.readdirSync(target).length) continue
        throw Error(`INSTALLER_ROLLBACK_CONFLICT: ${item.file}; local contents preserved`)
      }
      const currentHash = sha256(fs.readFileSync(target))
      if (currentHash === item.originalHash) continue
      if (currentHash !== item.newHash) throw Error(`INSTALLER_ROLLBACK_CONFLICT: ${item.file}; local edits preserved`)
    }
    if (item.existed) {
      fs.mkdirSync(dirname(target), { recursive: true })
      fs.copyFileSync(join(area, 'backup', String(i)), target)
      fs.chmodSync(target, item.mode)
    } else {
      if (fs.existsSync(target) && !fs.lstatSync(target).isDirectory()) fs.unlinkSync(target)
      if (item.emptyDirectory) fs.mkdirSync(target, { recursive: true })
    }
  }
  fs.unlinkSync(join(area, 'journal.json'))
}

export async function installRelease({ root, mode, ref, manifest, readSource, beforeApply = () => {} }) {
  root = fs.realpathSync(resolve(root))
  if (!['local', 'external'].includes(mode) || !/^[a-f0-9]{40}$/.test(ref)) throw Error('INSTALLER_MODE_OR_REF_INVALID')
  if (manifest.schema !== 1 || manifest.contract !== contract || !/^[a-zA-Z0-9._-]{1,60}$/.test(manifest.version)) throw Error('INSTALLER_MANIFEST_UNSUPPORTED')
  const entries = Object.entries(manifest.files).filter(([, entry]) => entry.modes.includes(mode))
  if (!entries.length || entries.length > 150) throw Error('INSTALLER_MANIFEST_INVALID')
  for (const [file, entry] of entries) {
    safe(root, file)
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('INSTALLER_MANIFEST_INVALID')
  }
  const area = join(root, '.runly-installer')
  if (isLink(area)) throw Error('INSTALLER_SYMLINK_REFUSED')
  fs.mkdirSync(area, { recursive: true, mode: 0o700 })
  for (const name of ['update.lock', 'deploy.lock', 'journal.json', 'state.json', 'backup', 'stage']) {
    const target = join(area, name)
    if (isLink(target)) throw Error('INSTALLER_SYMLINK_REFUSED')
  }
  const deployment = join(area, 'deploy.lock')
  if (fs.existsSync(deployment)) {
    const pid = Number(fs.readFileSync(deployment, 'utf8'))
    if (!Number.isSafeInteger(pid) || pid < 1) throw Error('INSTALLER_LOCK_INVALID')
    try { process.kill(pid, 0); throw Error('INSTALLER_DEPLOYMENT_IN_PROGRESS') } catch (error) { if (error.code !== 'ESRCH') throw error }
    fs.unlinkSync(deployment)
  }
  const lock = join(area, 'update.lock')
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'))
    if (!Number.isSafeInteger(pid) || pid < 1) throw Error('INSTALLER_LOCK_INVALID')
    try { process.kill(pid, 0); throw Error('INSTALLER_UPDATE_IN_PROGRESS') } catch (error) { if (error.code !== 'ESRCH') throw error }
    fs.unlinkSync(lock)
  }
  const descriptor = fs.openSync(lock, 'wx', 0o600)
  fs.writeFileSync(descriptor, String(process.pid)); fs.closeSync(descriptor)
  try {
    if (fs.existsSync(deployment)) throw Error('INSTALLER_DEPLOYMENT_IN_PROGRESS')
    restore(root, area)
    const previous = readJson(join(area, 'state.json'))
    if (previous && previous.mode !== mode || !previous && fs.existsSync(join(root, `.env.${mode === 'local' ? 'external' : 'local'}`)) && !fs.existsSync(join(root, `.env.${mode}`))) throw Error('INSTALLER_MODE_MISMATCH')
    if (previous?.version === manifest.version && entries.some(([file, entry]) => previous.files[file] !== entry.sha256)) throw Error('INSTALLER_VERSION_REUSED: publish a new Installer version')
    const stage = join(area, 'stage'), backup = join(area, 'backup')
    fs.mkdirSync(stage, { recursive: true, mode: 0o700 }); fs.mkdirSync(backup, { recursive: true, mode: 0o700 })
    const changes = [], conflicts = []
    // Download and verify EVERYTHING before replacing a single live file.
    for (const [file, entry] of entries) {
      const content = Buffer.from(await readSource(file))
      if (sha256(content) !== entry.sha256) throw Error(`INSTALLER_INTEGRITY_FAILED: ${file}`)
      const target = safe(root, file)
      let old = null, emptyDirectory = false
      if (fs.existsSync(target)) {
        const stat = fs.lstatSync(target)
        if (stat.isDirectory()) {
          if (fs.readdirSync(target).length) throw Error(`INSTALLER_DIRECTORY_CONFLICT: ${file}`)
          emptyDirectory = true
        } else {
          old = fs.readFileSync(target)
          const digest = sha256(canonical(old))
          if (digest !== entry.sha256 && digest !== previous?.files[file] && !(entry.legacyGitBlobs ?? []).includes(gitBlob(canonical(old)))) conflicts.push(file)
        }
      }
      const staged = safe(stage, file)
      fs.mkdirSync(dirname(staged), { recursive: true }); fs.writeFileSync(staged, content)
      changes.push({ file, existed: old !== null, emptyDirectory, mode: old !== null ? fs.statSync(target).mode : 0o644, originalHash: old && sha256(old), newHash: entry.sha256 })
    }
    if (conflicts.length) throw Error(`INSTALLER_LOCAL_CHANGES: files preserved; move custom settings to overrides or reconcile before retry: ${conflicts.join(', ')}`)
    changes.push({ file: '.runly-installer/state.json', existed: Boolean(previous), emptyDirectory: false, mode: 0o600 })
    for (const [i, change] of changes.entries()) {
      const stored = join(backup, String(i))
      if (isLink(stored)) throw Error('INSTALLER_SYMLINK_REFUSED')
      if (change.existed) fs.copyFileSync(safe(root, change.file, true), stored)
    }
    const journalTemp = join(area, `journal-${process.pid}.tmp`)
    fs.writeFileSync(journalTemp, JSON.stringify(changes), { mode: 0o600, flag: 'wx' })
    fs.renameSync(journalTemp, join(area, 'journal.json'))
    try {
      beforeApply()
      for (const change of changes.slice(0, -1)) {
        const target = safe(root, change.file)
        if (change.existed && sha256(fs.readFileSync(target)) !== change.originalHash) throw Error('INSTALLER_CONCURRENT_EDIT')
        if (change.existed && change.originalHash === change.newHash) {
          if (change.file.endsWith('.sh')) fs.chmodSync(target, 0o755)
          continue
        }
        if (change.emptyDirectory) fs.rmdirSync(target)
        fs.mkdirSync(dirname(target), { recursive: true })
        fs.renameSync(join(stage, change.file), target)
        fs.chmodSync(target, change.file.endsWith('.sh') ? 0o755 : 0o644)
      }
      const state = { schema: 1, contract, version: manifest.version, ref, mode, manifestSha256: sha256(Buffer.from(JSON.stringify(manifest))), files: Object.fromEntries(entries.map(([file, entry]) => [file, entry.sha256])) }
      fs.writeFileSync(join(area, 'state.json'), JSON.stringify(state, null, 2), { mode: 0o600 })
      fs.unlinkSync(join(area, 'journal.json'))
      return state
    } catch (error) { restore(root, area); throw error }
  } finally { fs.unlinkSync(lock) }
}

async function download(ref, file) {
  const url = `https://raw.githubusercontent.com/${repository}/${ref}/infra/installer/${file}`
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw Error(`INSTALLER_DOWNLOAD_FAILED: ${file}`)
  return Buffer.from(await response.arrayBuffer())
}
async function main() {
  const args = process.argv.slice(2), value = key => args.find(arg => arg.startsWith(`${key}=`))?.slice(key.length + 1)
  const mode = value('--mode'), root = resolve(value('--root') || process.cwd()), ref = value('--ref')
  if (!/^[a-f0-9]{40}$/.test(ref ?? '')) throw Error('INSTALLER_IMMUTABLE_REF_REQUIRED')
  const manifest = JSON.parse((await download(ref, 'installer-release.json')).toString('utf8'))
  const state = await installRelease({ root, mode, ref, manifest, readSource: file => download(ref, file) })
  console.log(`[runly-bootstrap] Verified Installer ${state.version} (${ref.slice(0, 12)}), mode ${mode}.`)
  if (mode === 'external' && !args.includes('--skip-env-copy') && !fs.existsSync(join(root, '.env.external'))) fs.copyFileSync(join(root, '.env.external.example'), join(root, '.env.external'), fs.constants.COPYFILE_EXCL)
  if (args.includes('--run')) {
    const result = spawnSync(process.execPath, [join(root, `setup-${mode}.mjs`)], { cwd: root, env: process.env, stdio: 'inherit', shell: false })
    if (result.error || result.status !== 0) throw Error('INSTALLER_SETUP_FAILED: scripts are installed; inspect the setup error before retrying')
  } else console.log(`[runly-bootstrap] Scripts ready. Run npm run runly:${mode} when configured.`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
