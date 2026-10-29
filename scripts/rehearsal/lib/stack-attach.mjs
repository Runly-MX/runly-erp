// Create, persist and re-attach the disposable Supabase stacks used by the backup/restore rehearsal. Re-attaching lets a
// run continue stage by stage without rebuilding a stack; nothing here points at anything but a project created by
// createStudioStack (its name carries the random token and its database holds a guard row).
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import pg from 'pg'
import { command, createStudioStack } from '../../fixtures/studio/supabase-stack.mjs'

const { createClient } = createRequire(new URL('../../../apps/api/package.json', import.meta.url))('@supabase/supabase-js')
const SERVICES = ['supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong']

export function parseEnvFile(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
}

// Storage signs S3 requests with the host of STORAGE_PUBLIC_URL, not the host it receives. In production that is the public
// domain the backup client also uses; in a disposable stack it has to be a name the client can resolve and use verbatim.
export async function setStoragePublicUrl(stack, url) {
  const config = JSON.parse(await readFile(stack.composeFile, 'utf8'))
  config.services['supabase-storage'].environment.STORAGE_PUBLIC_URL = url
  await writeFile(stack.composeFile, JSON.stringify(config, null, 2))
}

export async function createStack({ apiImage }) {
  const stack = await createStudioStack({ apiImage })
  await setStoragePublicUrl(stack, 'http://supabase-kong:8000')
  return stack
}

export async function startServices(stack, services = SERVICES) {
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '180', ...services])
}

export async function attachStack(state) {
  const envFile = join(state.directory, 'test.env')
  const secret = parseEnvFile(await readFile(envFile, 'utf8'))
  const composeFile = join(state.directory, 'compose.json')
  const urls = Object.fromEntries(Object.entries(state.ports).map(([key, port]) => [key, `http://127.0.0.1:${port}`]))
  const pool = new pg.Pool({ connectionString: `postgresql://postgres:${secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${state.ports.db}/postgres`, max: 4 })
  pool.on('error', () => {})
  // The cluster owner (supabase_admin): creating roles, restoring objects that belong to other roles, dropping the harness guard schema.
  const ownerPool = new pg.Pool({ connectionString: `postgresql://supabase_admin:${secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${state.ports.db}/postgres`, max: 2 })
  ownerPool.on('error', () => {})
  const compose = (args, options) => command('docker', ['compose', '--project-name', state.name, '--env-file', envFile, '-f', composeFile, ...args], options)
  return {
    ...state, secret, urls, pool, ownerPool, compose, composeFile, envFile, network: `${state.name}_default`,
    admin: createClient(urls.kong, secret.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
    databaseUrl: `postgresql://postgres:${secret.SUPABASE_POSTGRES_PASSWORD}@supabase-db:5432/postgres`,
    container: async service => (await compose(['ps', '-q', service])).trim(),
    async close() {
      await pool.end().catch(() => {})
      await ownerPool.end().catch(() => {})
      await compose(['down', '--volumes', '--remove-orphans']).catch(() => {})
    },
  }
}

export const stackState = stack => ({ name: stack.name, directory: stack.directory, ports: stack.ports })
export { SERVICES }
