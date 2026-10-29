import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { attachStack, createStack, startServices, stackState } from '../lib/stack-attach.mjs'
import { collectInventory, diffInventories } from '../lib/inventory.mjs'
import { exposesPasswords, missingRoleStatements } from '../lib/roles.mjs'
import { readDefaultPrivileges, resetDefaultPrivileges } from '../lib/privileges.mjs'
import { assessRecoverable } from '../lib/recoverable.mjs'
import { sha256 } from '../lib/tree.mjs'
import { addSecret, expect, note, save } from './common.mjs'
import { useSource } from './backup.mjs'
import { sourceInventoryFile } from './verify.mjs'

// pg_restore messages that are NOT problems. Each entry is justified by what was observed on the first run and checked
// against a clean control restore; anything else is "unexpected" and makes the restore count as failed.
export const EXPECTED_RESTORE_ERRORS = []

// Inventory of any database in the replica cluster (used for the scratch databases of the failure scenarios).
export async function inventoryOfDatabase(replica, database) {
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString: `postgresql://supabase_admin:${replica.secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${replica.ports.db}/${database}`, max: 1 })
  try { return await collectInventory({ pool, hashObjects: false }) } finally { await pool.end() }
}

export function classifyRestore(output) {
  const errors = output.split(/\r?\n/).filter(line => line.startsWith('pg_restore: error:'))
  const unexpected = errors.filter(line => !EXPECTED_RESTORE_ERRORS.some(pattern => pattern.test(line)))
  return { total: errors.length, unexpected }
}

const pgDockerArgs = (ctx, target, user, password, extra) => ['run', '--rm', '--network', target.network, '-e', 'PGHOST=supabase-db', '-e', 'PGPORT=5432', '-e', `PGUSER=${user}`, '-e', 'PGPASSWORD', '-e', 'PGDATABASE=postgres', ...extra]

// The role dump procedure (runbook B.4) against the source, as the application role, plus the controls that show the flag matters.
export async function rolesStage(ctx) {
  const source = await useSource(ctx)
  const password = source.secret.SUPABASE_POSTGRES_PASSWORD
  addSecret(ctx, password)
  const env = { ...process.env, PGPASSWORD: password }
  const dump = (label, user, extra) => ctx.log.attempt(label, 'docker', pgDockerArgs(ctx, source, user, password, ['-e', 'PGPASSWORD']).concat([ctx.backupImage, 'pg_dumpall', '--roles-only', ...extra]), { env })
  await expect(ctx, 'roles-dump-no-passwords', 'Runbook B.4: pg_dumpall --roles-only --no-role-passwords (as the application role) lists the custom roles and exposes no password', async () => {
    const result = await dump('pg_dumpall --roles-only --no-role-passwords (application role)', 'postgres', ['--no-role-passwords'])
    if (result.code !== 0) throw Error(`exit ${result.code}: ${result.output.slice(0, 300)}`)
    if (exposesPasswords(result.output)) throw Error('the role dump contains a PASSWORD clause')
    if (result.output.includes(ctx.state.source.rolePassword)) throw Error('the clear-text role password appears in the dump')
    for (const role of ['runly_rehearsal_login', 'runly_rehearsal_reader', 'runly_studio_socket']) if (!result.output.includes(`CREATE ROLE ${role};`)) throw Error(`role ${role} missing from the dump`)
    await writeFile(join(ctx.runDir, 'roles.sql'), result.output)
    return `${result.output.split(/\r?\n/).filter(line => line.startsWith('CREATE ROLE')).length} roles, no PASSWORD clause`
  })
  await expect(ctx, 'roles-flag-control', 'Control: as the superuser WITHOUT --no-role-passwords the dump does carry password hashes, so the flag is what protects them', async () => {
    const without = await dump('pg_dumpall --roles-only WITHOUT the flag (superuser control)', 'supabase_admin', [])
    const withFlag = await dump('pg_dumpall --roles-only --no-role-passwords (superuser)', 'supabase_admin', ['--no-role-passwords'])
    if (without.code !== 0 || withFlag.code !== 0) throw Error(`control commands failed (${without.code}/${withFlag.code})`)
    const hashes = (without.output.match(/PASSWORD '/g) ?? []).length
    if (hashes === 0) throw Error('the control dump has no password hashes, so it proves nothing')
    if (exposesPasswords(withFlag.output)) throw Error('the flag did not remove the password clauses')
    return `without the flag: ${hashes} password clause(s); with the flag: 0 (hashes not shown)`
  })
  await source.pool.end()
  await save(ctx)
}

async function bucketsOf(root) { return (await readdir(join(root, 'storage'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name) }

// Restores the extracted backup into a second, completely independent installation.
export async function replicaStage(ctx) {
  const root = ctx.state.extractRoot
  if (!root) throw Error('run the verify stage first (it extracts the snapshot)')
  if (ctx.state.replica) await (await attachStack(ctx.state.replica)).close().catch(() => {})
  const replicaStack = await createStack({ apiImage: ctx.images.api })
  ctx.state.replica = stackState(replicaStack)
  await save(ctx)
  await replicaStack.compose(['up', '-d', '--wait', '--wait-timeout', '180', 'supabase-db'])
  await replicaStack.verifyTarget()
  // verifyTarget leaves a guard schema that only this test harness uses; a real replica has none.
  await replicaStack.pool.query('DROP SCHEMA IF EXISTS runly_studio_test CASCADE')
  await replicaStack.pool.end()
  const replica = await attachStack(ctx.state.replica)
  const password = replica.secret.SUPABASE_POSTGRES_PASSWORD
  addSecret(ctx, password, replica.secret.SUPABASE_SERVICE_ROLE_KEY, replica.secret.SUPABASE_JWT_SECRET, replica.secret.S3_PROTOCOL_ACCESS_KEY_SECRET)
  const env = { ...process.env, PGPASSWORD: password }
  const sourceInventory = JSON.parse(await readFile(sourceInventoryFile(ctx), 'utf8'))
  const evidence = {}

  await expect(ctx, 'replica-independent', 'The replica is a different installation: different project, volumes, ports, database password and every Supabase key', async () => {
    const source = await attachStack(ctx.state.source)
    try {
      assert.notEqual(source.name, replica.name)
      assert.notEqual(source.ports.db, replica.ports.db)
      for (const key of ['SUPABASE_POSTGRES_PASSWORD', 'SUPABASE_JWT_SECRET', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'S3_PROTOCOL_ACCESS_KEY_SECRET']) assert.notEqual(source.secret[key], replica.secret[key], key)
      assert.equal((await replica.pool.query("SELECT to_regclass('public._prisma_migrations') AS t")).rows[0].t, null, 'the replica must start empty')
    } finally { await source.pool.end() }
  })

  // Roles first: pg_restore keeps GRANTs to roles that do not exist in the replica and fails on them. Control restore proves it.
  await expect(ctx, 'restore-without-roles-fails', 'Control: restoring WITHOUT the missing roles produces unexpected errors, so the restore would not count as recoverable', async () => {
    await replica.pool.query('CREATE DATABASE restore_noroles')
    const result = await ctx.log.attempt('pg_restore into a scratch database without applying the roles', 'docker', pgDockerArgs(ctx, replica, 'supabase_admin', password, ['-v', `${root}:/restore:ro`, '-e', 'PGDATABASE=restore_noroles']).concat([ctx.backupImage,
      'pg_restore', '--clean', '--if-exists', '-N', '_realtime', '--dbname', 'restore_noroles', '/restore/db.dump']), { env })
    const classified = classifyRestore(result.output)
    const roleErrors = result.output.split(/\r?\n/).filter(line => /role "runly_rehearsal_(login|reader)" does not exist/.test(line)).length
    const restoredPartly = await inventoryOfDatabase(replica, 'restore_noroles')
    ctx.state.partialNoRoles = { errors: classified.total, unexpected: classified.unexpected.length, tables: Object.keys(restoredPartly.tables).length,
      differences: diffInventories({ ...sourceInventory, storage: { buckets: [], objects: {} } }, { ...restoredPartly, storage: { buckets: [], objects: {} } }).length }
    await replica.pool.query('DROP DATABASE restore_noroles WITH (FORCE)')
    if (!roleErrors) throw Error(`expected errors about the missing roles; got ${classified.total} error(s): ${classified.unexpected[0] ?? 'none'}`)
    return `${roleErrors} "role does not exist" error(s) out of ${classified.total}`
  })

  await expect(ctx, 'roles-applied', 'Only the roles the replica lacks are created (from the password-free dump); no existing role is touched', async () => {
    const existing = (await replica.pool.query('SELECT rolname FROM pg_roles')).rows.map(row => row.rolname)
    const { missing, statements } = missingRoleStatements(await readFile(join(ctx.runDir, 'roles.sql'), 'utf8'), existing)
    if (!missing.includes('runly_rehearsal_login')) throw Error(`expected the custom roles to be missing, got: ${missing.join(',')}`)
    if (statements.some(statement => existing.some(role => new RegExp(`^(CREATE|ALTER) ROLE ${role}\\b`).test(statement)))) throw Error('a statement touches an existing role')
    for (const statement of statements) await replica.ownerPool.query(statement)
    return `created: ${missing.join(', ')}`
  })

  await expect(ctx, 'replica-default-privileges-reset', "The destination's stock default privileges are cleared before the restore, so the restored objects do not inherit grants the source never had", async () => {
    const before = (await readDefaultPrivileges(replica.ownerPool)).filter(row => row.grantees.includes('anon') || row.grantees.includes('authenticated')).length
    const result = await resetDefaultPrivileges(replica.ownerPool)
    if (!before) throw Error('the destination had no default privileges for anon/authenticated, so this step proves nothing')
    if (result.remaining) throw Error(`${result.remaining} default privilege entr(ies) remain`)
    return `${before} default-privilege rows opened to anon/authenticated were cleared (${result.statements} statements)`
  })

  let restoreOutput
  await expect(ctx, 'restore-database', 'pg_restore of the extracted dump into the replica database (as its owner role), errors classified', async () => {
    const result = await ctx.log.attempt('pg_restore --clean --if-exists -N _realtime into the replica', 'docker', pgDockerArgs(ctx, replica, 'supabase_admin', password, ['-v', `${root}:/restore:ro`]).concat([ctx.backupImage,
      'pg_restore', '--clean', '--if-exists', '-N', '_realtime', '--dbname', 'postgres', '/restore/db.dump']), { env })
    restoreOutput = result.output
    await writeFile(join(ctx.runDir, 'restore-output.txt'), result.output)
    const classified = classifyRestore(result.output)
    // A non-zero exit always counts, even when pg_restore printed no "error:" line (it can fail with only a warning summary).
    const unexpected = Math.max(classified.unexpected.length, result.code === 0 ? 0 : 1)
    evidence.restore = { ran: true, exitCode: result.code, unexpectedErrors: unexpected }
    if (unexpected) throw Error(`exit ${result.code}; ${classified.unexpected.length} unexpected error line(s), first: ${classified.unexpected[0] ?? '(none printed)'}`)
    return `exit ${result.code}; ${classified.total} error line(s), all in the expected baseline`
  })

  await replica.compose(['up', '-d', '--wait', '--wait-timeout', '180', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong']).catch(error => note(ctx, `services after restore: ${error.message.slice(0, 200)}`))

  await expect(ctx, 'restore-storage', 'Storage objects are uploaded to the replica through its own S3 endpoint with the replica keys (the keys keep their paths)', async () => {
    const buckets = await bucketsOf(root)
    const rclone = ['run', '--rm', '--network', replica.network, '-v', `${join(root, 'storage')}:/src:ro`, '-e', 'RCLONE_CONFIG_RS_TYPE=s3', '-e', 'RCLONE_CONFIG_RS_PROVIDER=Other', '-e', 'RCLONE_CONFIG_RS_ENV_AUTH=false',
      '-e', `RCLONE_CONFIG_RS_ACCESS_KEY_ID=${replica.secret.S3_PROTOCOL_ACCESS_KEY_ID}`, '-e', `RCLONE_CONFIG_RS_SECRET_ACCESS_KEY=${replica.secret.S3_PROTOCOL_ACCESS_KEY_SECRET}`,
      '-e', 'RCLONE_CONFIG_RS_ENDPOINT=http://supabase-kong:8000/storage/v1/s3', '-e', 'RCLONE_CONFIG_RS_REGION=local', '--entrypoint', 'rclone', ctx.backupImage]
    for (const bucket of buckets) await ctx.log.run(`rclone copy storage/${bucket} into the replica`, 'docker', [...rclone, 'copy', `/src/${bucket}`, `rs:${bucket}`, '--no-check-dest', '--retries', '2', '--log-level', 'ERROR'])
    return `${buckets.length} buckets: ${buckets.join(', ')}`
  })

  await expect(ctx, 'restore-comparison', 'Replica inventory equals the source inventory: tables (content digests), migrations, roles, memberships, privileges, auth users, buckets and the SHA-256 of every Storage object', async () => {
    const restored = await collectInventory({ pool: replica.pool, admin: replica.admin })
    await writeFile(join(ctx.runDir, 'inventory-replica.json'), JSON.stringify(restored, null, 2), { mode: 0o600 })
    const differences = diffInventories(sourceInventory, restored)
    evidence.comparison = { differences: differences.length }
    const objects = Object.entries(sourceInventory.storage.objects)
    evidence.objects = { mismatches: objects.filter(([key, value]) => restored.storage.objects[key]?.sha256 !== value.sha256).length, unreadable: Object.values(restored.storage.objects).filter(o => String(o.sha256).startsWith('UNREADABLE')).length }
    if (differences.length) throw Error(`${differences.length} difference(s): ${differences.slice(0, 4).map(d => `${d.section}: ${d.detail}`).join(' | ').slice(0, 500)}`)
    return `${Object.keys(restored.tables).length} tables, ${objects.length} objects, ${restored.migrations.length} migrations, ${restored.roles.length} roles: identical`
  })

  await expect(ctx, 'restore-associations', 'Associations survive: notes <-> image bindings, file records <-> Storage objects, memberships <-> roles <-> permissions', async () => {
    const q = async sql => (await replica.pool.query(sql)).rows
    const orphanBindings = (await q('SELECT count(*)::int AS n FROM note_image_binding b LEFT JOIN storage.objects o ON o.bucket_id = b.bucket AND o.name = b.object_key WHERE o.id IS NULL'))[0].n
    const orphanAssets = (await q('SELECT count(*)::int AS n FROM file_asset f LEFT JOIN storage.objects o ON o.bucket_id = f.bucket AND o.name = f.object_key WHERE f.enabled AND o.id IS NULL'))[0].n
    const sizeMismatch = (await q("SELECT count(*)::int AS n FROM file_asset f JOIN storage.objects o ON o.bucket_id = f.bucket AND o.name = f.object_key WHERE f.size_bytes <> (o.metadata->>'size')::bigint"))[0].n
    const memberships = (await q('SELECT count(*)::int AS n FROM membership m JOIN role r ON r.id = m.role_id JOIN user_profile u ON u.id = m.user_id WHERE r.company_id = m.company_id'))[0].n
    const bindings = (await q('SELECT count(*)::int AS n FROM note_image_binding'))[0].n
    if (orphanBindings || orphanAssets || sizeMismatch) throw Error(`orphan bindings=${orphanBindings}, orphan file records=${orphanAssets}, size mismatches=${sizeMismatch}`)
    if (!bindings || !memberships) throw Error('expected associations are absent')
    return `${bindings} image bindings, ${memberships} memberships with company-matching roles, 0 orphans`
  })

  await expect(ctx, 'restore-login', 'A restored user signs in to the replica with the original password (password hashes were restored, not recreated)', async () => {
    const user = ctx.state.source.users[0]
    const response = await fetch(`${replica.urls.kong}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: replica.secret.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: user.password }) })
    if (response.status !== 200) throw Error(`sign-in returned ${response.status}`)
    return 'status 200'
  })

  // Original secrets are not in the replica: a value encrypted with the source JWT_SECRET cannot be read with the replica's key,
  // but can with the original key held in the integral backup (the vault).
  await expect(ctx, 'secrets-stay-outside', 'Encrypted SMTP password: unreadable with the replica key, readable only with the original key kept in the integral-backup vault', async () => {
    const ciphertext = (await replica.pool.query("SELECT value FROM instance_config WHERE key = 'smtp.pass'")).rows[0]?.value
    if (!ciphertext || ciphertext !== ctx.state.source.smtp.ciphertext) throw Error('the encrypted SMTP password was not restored as stored')
    // The script prints a SHA-256 of the plaintext, never the plaintext, so the command log cannot mask the comparison away.
    const decrypt = jwtSecret => ctx.log.attempt('decrypt the stored SMTP password with a given JWT_SECRET', 'docker', ['run', '--rm', '-e', 'JWT_SECRET', '-e', 'CIPHERTEXT', '--entrypoint', 'node', ctx.images.api, '--input-type=module', '-e',
      "import { createHash } from 'node:crypto'; import { decryptPassword } from '/app/apps/api/src/services/smtp-service.js'; try { process.stdout.write(createHash('sha256').update(decryptPassword(process.env.CIPHERTEXT)).digest('hex')) } catch { process.exit(3) }"], { env: { ...process.env, JWT_SECRET: jwtSecret, CIPHERTEXT: ciphertext } })
    const withReplicaKey = await decrypt(replica.secret.SUPABASE_JWT_SECRET)
    if (withReplicaKey.code === 0) throw Error('the replica key decrypted a source secret')
    const vaultText = await readFile(ctx.state.vault, 'utf8')
    const original = /^JWT_SECRET=(.+)$/m.exec(vaultText)[1]
    const withOriginal = await decrypt(original)
    if (withOriginal.code !== 0 || withOriginal.output.trim() !== sha256(ctx.state.source.smtp.plaintext)) throw Error('the original key from the integral backup did not decrypt the secret')
    return 'replica key: cannot decrypt; original key (vault): decrypts to the original value'
  })

  ctx.state.replicaEvidence = evidence
  await replica.pool.end(); await replica.ownerPool.end()
  await save(ctx)
}
