import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertRecoverableStudioFailure, STUDIO_REALTIME_CHECKSUMS, STUDIO_REALTIME_MIGRATION } from './studio-realtime-db.mjs'

// Runs inside the installed API image, using its pg dependency. This keeps the
// standalone Installer dependency-free and works with already released images.
export async function externalStudioCheck({ sql, diagnose, recover }) {
  const { default: pg } = await import('pg')
  const target = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!target) throw Error('STUDIO_DATABASE_URL_REQUIRED')
  const database = new URL(target)
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || ![null, 'public'].includes(database.searchParams.get('schema'))) throw Error('STUDIO_DATABASE_TARGET_UNSUPPORTED')
  const app = new pg.Client({ connectionString: target })
  let owner
  const inspect = async () => {
    const history = (await app.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL present")).rows[0].present
    const failed = history ? (await app.query('SELECT migration_name AS name,checksum,logs FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows : []
    const clean = (await app.query("SELECT to_regprocedure('runly_studio.socket_allowed(text)') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND policyname IN ('studio_socket_read','studio_socket_write')) AS clean")).rows[0].clean
    return { failed, clean }
  }
  const prepared = async () => (await app.query(`SELECT CASE WHEN to_regrole('runly_studio_socket') IS NULL OR to_regnamespace('realtime') IS NULL THEN false ELSE
    has_schema_privilege('runly_studio_socket','realtime','USAGE') AND
    NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='runly_studio_socket' AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND
    NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=to_regrole('runly_studio_socket')) END AS ready`)).rows[0].ready
  try {
    await app.connect()
    const state = await inspect()
    if (diagnose) {
      console.log(JSON.stringify({ ready: await prepared(), clean: state.clean, failed: state.failed.map(({ name, checksum, logs }) => ({ name, checksum, detailsAvailable: Boolean(logs?.trim()) })) }))
      return
    }
    if (state.failed.length) {
      assertRecoverableStudioFailure(state)
      if (!recover) throw Error('STUDIO_KNOWN_FAILURE: execute node studio-realtime-external.mjs --recover-known-failure --api-image=YOUR_EXISTING_API_IMAGE')
    } else if (recover) throw Error('STUDIO_NO_FAILED_MIGRATION: no recovery needed')
    if (!await prepared()) {
      const adminTarget = process.env.SUPABASE_ADMIN_DATABASE_URL || target
      const a = new URL(adminTarget), b = new URL(target)
      if (!['postgres:', 'postgresql:'].includes(a.protocol) || a.hostname !== b.hostname || (a.port || '5432') !== (b.port || '5432') || a.pathname !== b.pathname) throw Error('STUDIO_ADMIN_TARGET_MISMATCH')
      owner = new pg.Client({ connectionString: adminTarget })
      try {
        await owner.connect()
        await owner.query('BEGIN')
        await owner.query(sql)
        await owner.query('COMMIT')
      } catch {
        await owner.query('ROLLBACK').catch(() => {})
        throw Error('STUDIO_OWNER_PREPARATION_REQUIRED: configure SUPABASE_ADMIN_DATABASE_URL in .secrets/studio-admin.env using the same database endpoint; application credentials were not changed')
      }
      if (!await prepared()) throw Error('STUDIO_OWNER_PREPARATION_NOT_VISIBLE')
    }
    if (recover) assertRecoverableStudioFailure(await inspect())
    console.log('STUDIO_OWNER_READY')
  } finally {
    if (owner) await owner.end().catch(() => {})
    await app.end().catch(() => {})
  }
}

export function prepareExternalStudioRealtime({ image, envFile, cwd, diagnose = false, recover = false, dockerArgs = [], spawn = spawnSync }) {
  if (!image || !/^[a-zA-Z0-9][a-zA-Z0-9./_:@-]+$/.test(image)) throw Error('EXPLICIT_API_IMAGE_REQUIRED')
  const adminFile = join(cwd, '.secrets/studio-admin.env')
  if (!diagnose && existsSync(adminFile)) {
    const entries = readFileSync(adminFile, 'utf8').split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#'))
    if (entries.length !== 1 || !/^SUPABASE_ADMIN_DATABASE_URL=\S+$/.test(entries[0])) throw Error('STUDIO_ADMIN_FILE_INVALID: only SUPABASE_ADMIN_DATABASE_URL is allowed')
  }
  // Owner credentials are passed only to this short-lived job, never API/worker.
  const base = ['run', '--rm', '--pull=never', '--add-host', 'host.docker.internal:host-gateway', ...dockerArgs, '--env-file', envFile]
  const adminArgs = !diagnose && existsSync(adminFile) ? ['--env-file', adminFile] : []
  const sql = readFileSync(join(cwd, 'supabase/volumes/db/studio-realtime-role.sql'), 'utf8')
  const source = `const STUDIO_REALTIME_MIGRATION=${JSON.stringify(STUDIO_REALTIME_MIGRATION)};
const STUDIO_REALTIME_CHECKSUMS=new Set(${JSON.stringify([...STUDIO_REALTIME_CHECKSUMS])});
${assertRecoverableStudioFailure.toString()}
const check=${externalStudioCheck.toString()};
try { await check(${JSON.stringify({ sql, diagnose, recover })}); } catch(error) {
  console.error(/^(STUDIO_|EXPLICIT_)/.test(error.message) ? error.message : 'STUDIO_DATABASE_CHECK_FAILED: connection or inspection failed; no migration was attempted'); process.exitCode=1;
}`
  const result = spawn('docker', [...base, ...adminArgs, '-i', '--entrypoint', 'node', image, '--input-type=module'], { cwd, input: source, encoding: 'utf8', shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
  if (result.error || result.status !== 0) throw Error(result.stderr?.split('\n').find(line => line.startsWith('STUDIO_')) || 'STUDIO_DATABASE_CHECK_FAILED')
  if (diagnose) console.log(result.stdout.trim())
  if (recover) {
    const resolved = spawn('docker', [...base, '--entrypoint', 'pnpm', image, 'exec', 'prisma', 'migrate', 'resolve', '--rolled-back', STUDIO_REALTIME_MIGRATION], { cwd, shell: false, stdio: 'inherit' })
    if (resolved.error || resolved.status !== 0) throw Error('STUDIO_MIGRATION_RESOLVE_FAILED')
  }
}
