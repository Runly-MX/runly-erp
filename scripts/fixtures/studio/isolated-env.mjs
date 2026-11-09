// Environment for child processes (API, prisma, seed) that run against a DISPOSABLE stack.
// Starting from process.env would leak the developer's remote destinations, and the API itself
// loads the repository .env for every variable that is not already defined (dotenv never overrides,
// even an empty string). So: pass only a small OS allowlist, define every name found in the .env
// files as an empty string (names only, values are never read), then apply the explicit overrides.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OS_KEYS = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'OS', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']
const ENV_FILES = ['.env', '.env.local', 'apps/api/.env', 'apps/api/.env.local', 'infra/installer/.env.local']
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\]|supabase-[a-z]+)$/
const DESTINATIONS = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'RUNLY_SUPABASE_PUBLIC_URL']

export function envFileNames(root = resolve('.')) {
  const names = new Set()
  for (const file of ENV_FILES) {
    const path = join(root, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) { const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line); if (match) names.add(match[1]) }
  }
  return names
}

export function isolatedEnv(overrides, { root } = {}) {
  for (const key of DESTINATIONS) {
    const value = overrides[key]
    if (value === undefined || value === '') continue
    let host; try { host = new URL(value).hostname } catch { throw new Error(`ISOLATED_ENV_UNPARSABLE_${key}`) }
    if (!LOCAL_HOST.test(host)) throw new Error(`ISOLATED_ENV_REMOTE_DESTINATION_${key}`)
  }
  if (!overrides.DATABASE_URL || !overrides.SUPABASE_URL) throw new Error('ISOLATED_ENV_DESTINATIONS_REQUIRED')
  const env = {}
  for (const key of OS_KEYS) if (process.env[key] !== undefined) env[key] = process.env[key]
  for (const name of envFileNames(root)) env[name] = ''
  return { ...env, ...overrides }
}
