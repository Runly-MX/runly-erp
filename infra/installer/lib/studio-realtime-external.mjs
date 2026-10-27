import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertRecoverableStudioFailure, STUDIO_REALTIME_CHECKSUMS, STUDIO_REALTIME_MIGRATION } from './studio-realtime-db.mjs'

// Runs inside the installed API image, using its pg dependency. This keeps the
// standalone Installer dependency-free and works with already released images.
export async function externalStudioCheck({ sql, diagnose, recover, recoveryCommand, prepare = true }) {
  const { default: pg } = await import('pg')
  const { readFile } = await import('node:fs/promises')
  const { createHash } = await import('node:crypto')
  const migrationSql = await readFile(`/app/prisma/migrations/${STUDIO_REALTIME_MIGRATION}/migration.sql`, 'utf8')
  if (!STUDIO_REALTIME_CHECKSUMS.has(createHash('sha256').update(migrationSql).digest('hex'))) throw Error('STUDIO_IMAGE_MIGRATION_MISMATCH')
  const target = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!target) throw Error('STUDIO_DATABASE_URL_REQUIRED')
  const database = new URL(target)
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || ![null, 'public'].includes(database.searchParams.get('schema'))) throw Error('STUDIO_DATABASE_TARGET_UNSUPPORTED')
  const app = new pg.Client({ connectionString: target, connectionTimeoutMillis: 10000, query_timeout: 15000 })
  let owner
  const inspect = async () => {
    const history = (await app.query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL present")).rows[0].present
    const failed = history ? (await app.query('SELECT migration_name AS name,checksum,logs FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows : []
    const objects = (await app.query("SELECT to_regprocedure('runly_studio.socket_allowed(text)') IS NOT NULL AS function_present, (SELECT count(*)::int FROM pg_policies WHERE schemaname='realtime' AND policyname IN ('studio_socket_read','studio_socket_write')) AS policies")).rows[0]
    const historyRows = history ? (await app.query('SELECT checksum,finished_at IS NOT NULL AS finished FROM public._prisma_migrations WHERE migration_name=$1', [STUDIO_REALTIME_MIGRATION])).rows : []
    return { failed, clean: !objects.function_present && objects.policies === 0, installed: objects.function_present && objects.policies === 2, history: historyRows }
  }
  const prepared = async () => (await app.query(`SELECT CASE WHEN to_regrole('runly_studio_socket') IS NULL OR to_regnamespace('realtime') IS NULL THEN false ELSE
    has_schema_privilege('runly_studio_socket','realtime','USAGE') AND
    NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='runly_studio_socket' AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND
    NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=to_regrole('runly_studio_socket')) END AS ready`)).rows[0].ready
  try {
    await app.connect()
    const state = await inspect()
    const privileges = (await app.query(`SELECT
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolcreaterole OR rolsuper)) AS "canCreateRole",
      to_regnamespace('realtime') IS NOT NULL AS "schemaExists",
      to_regrole('runly_studio_socket') IS NOT NULL AS "roleExists",
      NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='runly_studio_socket' AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=to_regrole('runly_studio_socket')) AS "roleSafe",
      CASE WHEN to_regnamespace('realtime') IS NULL THEN false ELSE has_schema_privilege(current_user,'realtime','USAGE WITH GRANT OPTION') END AS "canGrantUsage",
      (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='realtime') AS "schemaOwner"`)).rows[0]
    if (diagnose) {
      console.log(JSON.stringify({ ready: await prepared(), privileges, clean: state.clean, failed: state.failed.map(({ name, checksum, logs }) => ({ name, checksum, detailsAvailable: Boolean(logs?.trim()) })) }))
      return
    }
    if (state.history.some(row => !STUDIO_REALTIME_CHECKSUMS.has(row.checksum))) throw Error('STUDIO_HISTORY_CHECKSUM_MISMATCH: review migration history; nothing was resolved')
    if (state.history.some(row => row.finished) && !state.installed || !state.history.some(row => row.finished) && !state.clean) throw Error('STUDIO_PARTIAL_OBJECTS_REQUIRES_REVIEW: migration history and SQL objects disagree')
    if (!privileges.roleSafe) throw Error('STUDIO_SOCKET_ROLE_MUST_BE_ISOLATED: owner must review role attributes and memberships; no permissions were changed')
    if (state.failed.length) {
      assertRecoverableStudioFailure(state)
      if (!recover) throw Error(`STUDIO_KNOWN_FAILURE: execute ${recoveryCommand}`)
    } else if (recover) throw Error('STUDIO_NO_FAILED_MIGRATION: no recovery needed')
    if (!await prepared()) {
      if (!prepare) throw Error('STUDIO_OWNER_PREPARATION_REQUIRED: rerun the normal setup to prepare permissions before API database initialization')
      if (!privileges.schemaExists) throw Error('STUDIO_REALTIME_SCHEMA_MISSING: provision Supabase Realtime before Runly')
      if (!process.env.SUPABASE_ADMIN_DATABASE_URL && ((!privileges.roleExists && !privileges.canCreateRole) || !privileges.canGrantUsage)) {
        const missing = [!privileges.roleExists && !privileges.canCreateRole ? 'CREATE ROLE' : '', !privileges.canGrantUsage ? 'USAGE WITH GRANT OPTION on schema realtime' : ''].filter(Boolean).join('; ')
        throw Error(`STUDIO_OWNER_PREPARATION_REQUIRED: missing ${missing}; schema owner ${privileges.schemaOwner} must run supabase/volumes/db/studio-realtime-role.sql once, or configure .secrets/studio-admin.env for the same database`)
      }
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

export function prepareExternalStudioRealtime({ image, envFile, cwd, diagnose = false, recover = false, prepare = true, dockerArgs = [], recoveryCommand = 'node studio-realtime-external.mjs --recover-known-failure --api-image=YOUR_EXISTING_API_IMAGE', spawn = spawnSync }) {
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
try { await check(${JSON.stringify({ sql, diagnose, recover, recoveryCommand, prepare })}); } catch(error) {
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
