import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { command } from '../../fixtures/studio/supabase-stack.mjs'
import { attachStack } from '../lib/stack-attach.mjs'
import { MINIO_IMAGE, coverageOf, recoveryCli, recoveryConfig, resticFor, runBackup } from '../lib/backup-flow.mjs'
import { assessRecoverable } from '../lib/recoverable.mjs'
import { collectInventory, diffInventories } from '../lib/inventory.mjs'
import { hashTree } from '../lib/tree.mjs'
import { locateBackupRoot } from '../../recovery/recovery-assessment.mjs'
import { expect, rand, save, addSecret } from './common.mjs'
import { useSource } from './backup.mjs'
import { classifyRestore, inventoryOfDatabase } from './restore.mjs'
import { sourceInventoryFile } from './verify.mjs'

// Evidence of a fully good pipeline (what the real positive run measured), with ONE piece replaced by what the faulty
// scenario really produced. The verdict must turn negative for that reason, not merely because evidence is missing.
const goodEvidence = () => ({
  credentials: { ok: true }, repository: { ok: true }, snapshot: { found: true, coverage: 'complete-declared', pending: false },
  extraction: { ok: true }, assessment: { exitCode: 0, hashMismatches: 0, missingFiles: 0 }, restore: { ran: true, unexpectedErrors: 0 },
  comparison: { differences: 0 }, objects: { mismatches: 0, unreadable: 0 },
})

async function verdictIs(ctx, id, title, fault, apply, expectedReason) {
  await expect(ctx, id, title, async () => {
    const baseline = assessRecoverable(goodEvidence())
    if (!baseline.recoverable) throw Error('the baseline evidence is not recoverable; the test would prove nothing')
    const evidence = goodEvidence()
    const observed = await apply(evidence)
    const verdict = assessRecoverable(evidence)
    if (verdict.recoverable) throw Error(`the faulty scenario was reported as complete and recoverable (${fault})`)
    if (!verdict.reasons.some(reason => expectedReason.test(reason))) throw Error(`negative for the wrong reason: ${verdict.reasons.join(' | ')}`)
    return `NOT recoverable (${verdict.reasons[0]}); observed: ${observed}`
  })
}

const shim = async (ctx, name, body) => {
  const file = join(ctx.work, `shim-${name}`)
  await writeFile(file, `#!/bin/bash\n${body}\n`, { mode: 0o755 }); await chmod(file, 0o755)
  return file
}

export async function failuresStage(ctx) {
  const source = await useSource(ctx)
  const replica = ctx.state.replica ? await attachStack(ctx.state.replica) : null
  // Self-heal: if an earlier run was killed inside the missing-object scenario, put the file back before anything else runs.
  const storageContainer = await source.container('supabase-storage')
  await command('docker', ['exec', storageContainer, 'sh', '-c', 'for f in $(find /var/lib/storage -name "*.gone"); do mv "$f" "${f%.gone}"; done']).catch(() => {})
  const extractRoot = ctx.state.extractRoot
  const freshRepo = async (suffix) => {
    const repo = { bucket: `rehearsal-f-${suffix}-${rand(3)}`, password: rand(24) }
    addSecret(ctx, repo.password); await ctx.minio.makeBucket(repo.bucket)
    return repo
  }
  const snapshotState = async repo => {
    const listing = await resticFor(ctx, repo).snapshots()
    const latest = [...listing.snapshots].sort((a, b) => a.time.localeCompare(b.time)).at(-1)
    return { ok: listing.ok, count: listing.snapshots.length, ...(latest ? coverageOf(latest) : { coverage: 'none', pending: false }), latest }
  }

  // F1 - interrupted backup: the process dies after the upload, before the integrity check and the coverage tag.
  const interrupted = await freshRepo('interrupted')
  await verdictIs(ctx, 'fail-interrupted-after-upload', 'Interrupted backup (killed after the upload, before check and tagging): only a PENDING snapshot exists, never a complete one', 'interrupted backup', async evidence => {
    const kill = await shim(ctx, 'restic-kill', 'if [ "$1" = check ]; then exit 137; fi\nexec /usr/bin/restic "$@"')
    const result = await runBackup(ctx, { label: 'backup: interrupted after the upload (restic check killed)', bucket: interrupted.bucket, password: interrupted.password, configFile: ctx.state.files.redacted, shims: { restic: kill } })
    if (result.ok) throw Error('the interrupted backup reported success')
    // The scenario is only meaningful if the process really died AFTER the upload: exit 137 from the killed integrity check and a pending snapshot.
    if (result.code !== 137) throw Error(`the interruption did not happen where intended (exit ${result.code}): ${result.output.slice(-400)}`)
    const state = await snapshotState(interrupted)
    if (state.count !== 1 || !state.pending) throw Error(`expected exactly one PENDING snapshot after the interruption, found ${state.count} (pending=${state.pending})`)
    if (state.coverage === 'complete-declared' && !state.pending) throw Error('an interrupted backup left a verified complete snapshot')
    const verify = await ctx.log.attempt('verify-backup.sh against the interrupted repository', 'docker', ['run', '--rm', '--add-host', 'host.docker.internal:host-gateway', '--env-file', ctx.envWithoutBackup,
      '-e', `BACKUP_S3_ENDPOINT=${ctx.minio.containerEndpoint}`, '-e', `BACKUP_S3_BUCKET=${interrupted.bucket}`, '-e', `BACKUP_S3_ACCESS_KEY_ID=${ctx.minio.user}`, '-e', `BACKUP_S3_SECRET_ACCESS_KEY=${ctx.minio.password}`, '-e', `RESTIC_PASSWORD=${interrupted.password}`, ctx.backupImage, './verify-backup.sh'])
    if (verify.code === 0) throw Error('verify-backup.sh accepted a repository with only a pending snapshot')
    evidence.snapshot = { found: state.count > 0, coverage: state.coverage, pending: state.pending }
    return `backup exit ${result.code}; snapshots ${state.count}, pending=${state.pending}; verify-backup.sh exit ${verify.code}`
  }, /pending|coverage|not complete/)

  // F1b - interrupted during the dump: nothing at all is published.
  const dumpKilled = await freshRepo('dumpkilled')
  await expect(ctx, 'fail-interrupted-during-dump', 'Interrupted backup (pg_dump killed): no snapshot is published at all', async () => {
    const kill = await shim(ctx, 'pgdump-kill', 'for argument in "$@"; do if [ "$argument" = -Fc ]; then exit 137; fi; done\nexec /usr/local/bin/pg_dump "$@"')
    const result = await runBackup(ctx, { label: 'backup: pg_dump killed during collection', bucket: dumpKilled.bucket, password: dumpKilled.password, configFile: ctx.state.files.redacted, shims: { pg_dump: kill } })
    if (result.ok) throw Error('a backup whose dump was killed reported success')
    const state = await snapshotState(dumpKilled)
    if (state.count !== 0 && state.coverage === 'complete-declared') throw Error('a complete snapshot exists after a killed dump')
    return `exit ${result.code}; snapshots in the repository: ${state.count}`
  })

  // F2 - an object listed in storage.objects whose file is gone: the source is inconsistent and the backup must refuse.
  const missingRepo = await freshRepo('missing')
  await verdictIs(ctx, 'fail-missing-object', 'Missing object (row in storage.objects, file gone): the backup refuses and publishes no complete snapshot', 'missing object', async evidence => {
    const victim = ctx.state.source.objects.find(object => object.bucket === 'runly-files' && object.size > 1_000_000)
    const container = await source.container('supabase-storage')
    const located = (await command('docker', ['exec', container, 'sh', '-c', `find /var/lib/storage -type f -path "*reporte-anual*" | head -1`])).trim()
    if (!located) throw Error('could not locate the object file in the Storage volume')
    await command('docker', ['exec', container, 'sh', '-c', `mv "${located}" "${located}.gone"`])
    try {
      const result = await runBackup(ctx, { label: 'backup: Storage file missing for a listed object', bucket: missingRepo.bucket, password: missingRepo.password, configFile: ctx.state.files.redacted, fastFail: true })
      if (result.ok) throw Error('the backup completed although a listed object is missing')
      const state = await snapshotState(missingRepo)
      if (state.coverage === 'complete-declared') throw Error('a complete snapshot was published for an inconsistent source')
      evidence.snapshot = { found: state.count > 0, coverage: state.coverage, pending: state.pending }
      return `backup exit ${result.code} (${result.output.split(/\r?\n/).filter(line => /No se complet|Falló|coincide|Falta/.test(line)).slice(-1)[0] ?? 'refused'}); snapshots: ${state.count}; object: ${victim.name.slice(-20)}`
    } finally { await command('docker', ['exec', container, 'sh', '-c', `mv "${located}.gone" "${located}"`]) }
  }, /coverage|no snapshot/)

  // F3 - an altered file inside an extracted backup, and a corrupted repository.
  await verdictIs(ctx, 'fail-altered-file', 'Altered file in the extracted backup: the CLI assessment and the independent hash both catch it', 'altered file', async evidence => {
    const copy = join(ctx.runDir, 'extract-altered')
    await rm(copy, { recursive: true, force: true })
    await command('docker', ['run', '--rm', '-v', `${join(ctx.runDir, 'extract-a')}:/from:ro`, '-v', `${ctx.runDir}:/to`, '--entrypoint', 'sh', ctx.backupImage, '-c', 'cp -a /from /to/extract-altered'])
    const root = await locateBackupRoot(copy)
    const object = ctx.state.source.objects.find(o => o.name.endsWith('reporte-anual.bin'))
    const file = join(root, 'storage', object.bucket, ...object.name.split('/'))
    const bytes = await readFile(file); bytes[1000] ^= 0xff; await writeFile(file, bytes)
    const assessed = await recoveryCli(ctx, ['assess', '--input', copy])
    const tree = await hashTree(join(root, 'storage'))
    const mismatches = ctx.state.source.objects.filter(o => tree.get(`${o.bucket}/${o.name}`)?.sha256 !== o.sha256).length
    if (assessed.code === 0) throw Error('the CLI assessment accepted an altered file')
    if (mismatches !== 1) throw Error(`the independent hash found ${mismatches} altered object(s), expected 1`)
    evidence.assessment = { exitCode: assessed.code, hashMismatches: mismatches, missingFiles: 0 }
    return `assess exit ${assessed.code}; independent hash: ${mismatches} object differs`
  }, /assessment|hashes/)

  await verdictIs(ctx, 'fail-missing-file-in-backup', 'File deleted from the extracted backup: the assessment reports it missing', 'missing file in the backup', async evidence => {
    const copy = join(ctx.runDir, 'extract-missing')
    await rm(copy, { recursive: true, force: true })
    await command('docker', ['run', '--rm', '-v', `${join(ctx.runDir, 'extract-a')}:/from:ro`, '-v', `${ctx.runDir}:/to`, '--entrypoint', 'sh', ctx.backupImage, '-c', 'cp -a /from /to/extract-missing'])
    const root = await locateBackupRoot(copy)
    const object = ctx.state.source.objects.find(o => o.name.endsWith('testigo.txt'))
    await rm(join(root, 'storage', object.bucket, ...object.name.split('/')))
    const assessed = await recoveryCli(ctx, ['assess', '--input', copy])
    if (assessed.code === 0) throw Error('the CLI assessment accepted a backup with a missing file')
    evidence.assessment = { exitCode: assessed.code, hashMismatches: 0, missingFiles: 1 }
    return `assess exit ${assessed.code}`
  }, /assessment|missing/)

  const corrupted = await freshRepo('corrupt')
  await verdictIs(ctx, 'fail-corrupt-repository', 'Corrupted repository data: restic check --read-data and restore --verify fail', 'corrupted repository', async evidence => {
    const made = await runBackup(ctx, { label: 'backup: database-only run for the corruption test', bucket: corrupted.bucket, password: corrupted.password, mode: 'database-only', configFile: ctx.state.files.redacted })
    if (!made.ok) throw Error(`could not prepare the repository: ${made.output.slice(-300)}`)
    // Overwrite one data pack through the S3 API with random bytes of the same size class: a deterministic, legitimate way to damage the repository content.
    const listing = await ctx.log.attempt('mc ls: find a data pack of the repository', 'docker', ['run', '--rm', '--env-file', join(ctx.work, 'mc.env'), '--entrypoint', '/usr/bin/mc', MINIO_IMAGE, 'ls', '--recursive', `t/${corrupted.bucket}/${ctx.instanceId}/data`])
    const pack = listing.output.split(/\r?\n/).map(line => line.trim().split(/\s+/).at(-1)).find(name => /^[0-9a-f]{2}\/[0-9a-f]{64}$/.test(name ?? ''))
    if (!pack) throw Error(`no data pack found in the repository: ${listing.output.slice(0, 200)}`)
    const overwritten = await ctx.log.attempt('mc pipe: overwrite one data pack with random bytes', 'docker', ['run', '--rm', '-i', '--env-file', join(ctx.work, 'mc.env'), '--entrypoint', '/usr/bin/mc', MINIO_IMAGE, 'pipe', `t/${corrupted.bucket}/${ctx.instanceId}/data/${pack}`], { input: Buffer.from(rand(2048), 'hex') })
    if (overwritten.code !== 0) throw Error(`could not damage the pack: ${overwritten.output.slice(0, 200)}`)
    const repo = resticFor(ctx, corrupted)
    const check = await repo.attempt('restic check --read-data on the corrupted repository', ['check', '--read-data'])
    const restore = await repo.attempt('restic restore --verify from the corrupted repository', ['restore', 'latest', '--target', '/tmp/restore', '--verify'])
    if (check.code === 0 && restore.code === 0) throw Error('neither check nor restore noticed the corruption')
    evidence.repository = { ok: check.code === 0 }
    evidence.extraction = { ok: restore.code === 0 }
    return `check exit ${check.code}; restore --verify exit ${restore.code}`
  }, /integrity|extraction/)

  // F4 - wrong credentials.
  await verdictIs(ctx, 'fail-wrong-credentials', 'Wrong credentials (restic password, then S3 secret): the CLI cannot list or extract, and nothing is reported', 'wrong credential', async evidence => {
    const A = ctx.state.repos.a
    const badPassword = await recoveryConfig(ctx, { bucket: A.bucket, password: `${A.password}x`, file: join(ctx.work, 'recovery-bad-password.env') })
    const badSecret = await recoveryConfig(ctx, { bucket: A.bucket, password: A.password, secret: `${ctx.minio.password}x`, file: join(ctx.work, 'recovery-bad-secret.env') })
    const first = await recoveryCli(ctx, ['inspect', '--config', badPassword])
    // restic retries a rejected S3 signature with growing waits instead of failing at once: cap the call and clean up its container.
    const second = await recoveryCli(ctx, ['inspect', '--config', badSecret], { timeoutMs: 60000 })
    for (const id of (await command('docker', ['ps', '-q', '--filter', 'name=runly-recovery-'])).split(/s+/).filter(Boolean)) await command('docker', ['rm', '-f', id]).catch(() => {})
    const third = await recoveryCli(ctx, ['extract', '--config', badPassword, '--snapshot', ctx.state.snapshots.complete, '--output', join(ctx.runDir, 'extract-never')])
    if (first.code === 0 || second.code === 0 || third.code === 0) throw Error(`a wrong credential was accepted (${first.code}/${second.code}/${third.code})`)
    evidence.credentials = { ok: false }
    return `exit codes: wrong password ${first.code}, wrong S3 secret ${second.timedOut ? 'no answer after 60 s (restic keeps retrying the rejected signature)' : second.code}, extract ${third.code}`
  }, /credentials/)

  // F5 - incomplete (database-only) snapshot is the only thing in the repository.
  const dbOnly = await freshRepo('dbonly')
  await verdictIs(ctx, 'fail-database-only-snapshot', 'Incomplete snapshot (database-only is the only one): classified as such, assessed as incomplete, and verify-backup.sh in complete mode rejects the repository', 'incomplete snapshot', async evidence => {
    const made = await runBackup(ctx, { label: 'backup: database-only run (the only snapshot)', bucket: dbOnly.bucket, password: dbOnly.password, mode: 'database-only', configFile: ctx.state.files.redacted })
    if (!made.ok) throw Error(`could not create the database-only snapshot: ${made.output.slice(-300)}`)
    const state = await snapshotState(dbOnly)
    if (state.coverage !== 'database-only') throw Error(`classified as ${state.coverage}`)
    const config = await recoveryConfig(ctx, { bucket: dbOnly.bucket, password: dbOnly.password, file: join(ctx.work, 'recovery-dbonly.env') })
    const output = join(ctx.runDir, 'extract-dbonly')
    await rm(output, { recursive: true, force: true })
    const extracted = await recoveryCli(ctx, ['extract', '--config', config, '--snapshot', state.latest.id, '--output', output])
    const assessed = await recoveryCli(ctx, ['assess', '--input', output])
    const verify = await ctx.log.attempt('verify-backup.sh (complete mode) against a database-only repository', 'docker', ['run', '--rm', '--add-host', 'host.docker.internal:host-gateway', '--env-file', ctx.envWithoutBackup,
      '-e', `BACKUP_S3_ENDPOINT=${ctx.minio.containerEndpoint}`, '-e', `BACKUP_S3_BUCKET=${dbOnly.bucket}`, '-e', `BACKUP_S3_ACCESS_KEY_ID=${ctx.minio.user}`, '-e', `BACKUP_S3_SECRET_ACCESS_KEY=${ctx.minio.password}`, '-e', `RESTIC_PASSWORD=${dbOnly.password}`, '-e', 'BACKUP_COVERAGE_MODE=complete', ctx.backupImage, './verify-backup.sh'])
    if (assessed.code === 0) throw Error('the assessment accepted a database-only snapshot as complete')
    if (verify.code === 0) throw Error('verify-backup.sh (complete mode) accepted a database-only repository')
    evidence.snapshot = { found: true, coverage: state.coverage, pending: false }
    evidence.assessment = { exitCode: assessed.code, hashMismatches: 0, missingFiles: 0 }
    return `classified ${state.coverage}; extract exit ${extracted.code}; assess exit ${assessed.code}; verify-backup.sh exit ${verify.code}`
  }, /coverage|assessment/)

  // F6 - a restore that only partly works. Run in a scratch database of the replica so the replica itself stays intact.
  if (replica) {
    const sourceInventory = JSON.parse(await readFile(sourceInventoryFile(ctx), 'utf8'))
    const restoreInto = async (database, dumpPath, label) => {
      await replica.ownerPool.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
      await replica.ownerPool.query(`CREATE DATABASE ${database}`)
      return ctx.log.attempt(label, 'docker', ['run', '--rm', '--network', replica.network, '-v', `${join(extractRoot)}:/restore:ro`, '-e', 'PGHOST=supabase-db', '-e', 'PGUSER=supabase_admin', '-e', 'PGPASSWORD', '-e', `PGDATABASE=${database}`,
        ctx.backupImage, 'pg_restore', '--clean', '--if-exists', '-N', '_realtime', '--dbname', database, dumpPath], { env: { ...process.env, PGPASSWORD: replica.secret.SUPABASE_POSTGRES_PASSWORD } })
    }
    const withoutStorage = inventory => ({ ...inventory, storage: { buckets: [], objects: {} } })
    // Damages a copy of the dump (never the original) and always removes the copy.
    const damagedCopy = async (name, shellBody, run) => {
      await command('docker', ['run', '--rm', '-v', `${extractRoot}:/restore`, '--entrypoint', 'sh', ctx.backupImage, '-c', `size=$(wc -c < /restore/db.dump); ${shellBody}`])
      try { return await run(`/restore/${name}`) } finally {
        await command('docker', ['run', '--rm', '-v', `${extractRoot}:/restore`, '--entrypoint', 'sh', ctx.backupImage, '-c', `rm -f /restore/${name}`]).catch(() => {})
        await replica.ownerPool.query(`DROP DATABASE IF EXISTS restore_${name.replace('.', '_')} WITH (FORCE)`).catch(() => {})
      }
    }
    const measure = async (name, dumpPath, label) => {
      const database = `restore_${name.replace('.', '_')}`
      const result = await restoreInto(database, dumpPath, label)
      const classified = classifyRestore(result.output)
      const restored = await inventoryOfDatabase(replica, database)
      const differences = diffInventories(withoutStorage(sourceInventory), withoutStorage(restored)).length
      return { result, classified, tables: Object.keys(restored.tables).length, differences }
    }

    // (a) The dump cannot be read at all: pg_restore stops at once and restores NOTHING (a total failure).
    await verdictIs(ctx, 'fail-unreadable-dump', 'Unreadable dump (file cut in half): pg_restore aborts and restores nothing, so the result is not accepted', 'unreadable dump', async evidence => {
      return damagedCopy('db.truncated', 'head -c $(( size / 2 )) /restore/db.dump > /restore/db.truncated', async path => {
        const run = await measure('db.truncated', path, 'pg_restore of a dump cut in half into a scratch database')
        if (run.result.code === 0) throw Error('a truncated dump restored without error')
        if (run.tables > 0) throw Error(`expected nothing restored, found ${run.tables} tables`)
        evidence.restore = { ran: true, unexpectedErrors: Math.max(run.classified.unexpected.length, 1) }
        evidence.comparison = { differences: run.differences }
        return `pg_restore exit ${run.result.code}; ${run.classified.total} error line(s); ${run.tables} tables restored; ${run.differences} difference(s)`
      })
    }, /restore|inventory/)

    // (b) Damage inside the data section: the TOC is readable, the restore advances and then fails for part of the data.
    await verdictIs(ctx, 'fail-damaged-data-section', 'Partially failed restore (bytes damaged in the data section): most tables are restored, some fail, and the result is not accepted', 'damaged data section', async evidence => {
      return damagedCopy('db.damaged', 'cp /restore/db.dump /restore/db.damaged && dd if=/dev/urandom of=/restore/db.damaged bs=1 count=4096 seek=$(( size * 9 / 10 )) conv=notrunc 2>/dev/null', async path => {
        const run = await measure('db.damaged', path, 'pg_restore of a dump with damaged data bytes into a scratch database')
        if (run.result.code === 0 && !run.differences) throw Error('a damaged dump restored cleanly and matched the source')
        if (run.tables === 0) throw Error('nothing was restored, so this is not a partial restore (the damage hit the table of contents)')
        evidence.restore = { ran: true, unexpectedErrors: Math.max(run.classified.unexpected.length, run.result.code === 0 ? 0 : 1) }
        evidence.comparison = { differences: run.differences }
        return `pg_restore exit ${run.result.code}; ${run.classified.total} error line(s); ${run.tables} tables restored; ${run.differences} difference(s) against the source`
      })
    }, /restore|inventory/)

    // (c) The roles the dump depends on are missing: measured during the replica restore (restore-without-roles-fails).
    await verdictIs(ctx, 'fail-partial-restore-missing-roles', 'Partially failed restore (required roles missing): objects are restored but grants fail, and the result is not accepted', 'missing roles', async evidence => {
      const measured = ctx.state.partialNoRoles
      if (!measured) throw Error('the replica stage did not record the restore without roles')
      if (!measured.tables || !measured.errors) throw Error(`not a partial restore: ${JSON.stringify(measured)}`)
      evidence.restore = { ran: true, unexpectedErrors: measured.unexpected }
      evidence.comparison = { differences: measured.differences }
      return `${measured.tables} tables restored, ${measured.errors} error line(s) (${measured.unexpected} unexpected), ${measured.differences} difference(s) against the source`
    }, /restore|inventory/)
    await replica.pool.end(); await replica.ownerPool.end()
  }
  await source.pool.end()
  await save(ctx)
}
