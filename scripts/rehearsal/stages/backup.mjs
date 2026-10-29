import { join } from 'node:path'
import { attachStack } from '../lib/stack-attach.mjs'
import { coverageOf, resticFor, runBackup } from '../lib/backup-flow.mjs'
import { addSecret, expect, note, save } from './common.mjs'

// Wires the saved source installation and the saved backup settings into `ctx` for every stage that runs a backup job.
export async function useSource(ctx) {
  const source = await attachStack(ctx.state.source)
  ctx.source = source
  ctx.envWithoutBackup = ctx.state.files.withoutBackup
  ctx.storageS3 = { endpoint: 'http://supabase-kong:8000/storage/v1/s3', key: source.secret.S3_PROTOCOL_ACCESS_KEY_ID, secret: source.secret.S3_PROTOCOL_ACCESS_KEY_SECRET, region: 'local' }
  addSecret(ctx, ctx.storageS3.secret)
  return source
}

const completeLine = /backup run complete \(complete\)/

export async function backupStage(ctx) {
  await useSource(ctx)
  const A = ctx.state.repos.a, B = ctx.state.repos.b
  const repoA = resticFor(ctx, { bucket: A.bucket, password: A.password })
  const run = (label, options) => runBackup(ctx, { label, ...options })
  ctx.state.snapshots = {}
  await expect(ctx, 'backup-legacy-snapshot', 'A legacy snapshot (no coverage tags) is placed in the repository first, as an old installation would have', async () => {
    await repoA.run('restic: init the rehearsal repository', ['init'])
    await repoA.run('restic: store a snapshot without Runly coverage tags', ['backup', '/legacy', '--host', ctx.instanceId, '--quiet'], ['-v', `${join(ctx.work, 'legacy')}:/legacy:ro`])
    const { snapshots } = await repoA.snapshots()
    if (snapshots.length !== 1 || coverageOf(snapshots[0]).coverage !== 'legacy-unknown') throw Error('legacy snapshot not as expected')
    ctx.state.snapshots.legacy = snapshots[0].id
  })
  await expect(ctx, 'backup-complete-1', 'The real Runly backup job (run-backup.sh) completes a first full backup with the REDACTED configuration', async () => {
    const result = await run('backup: complete run 1 (redacted configuration)', { bucket: A.bucket, password: A.password, configFile: ctx.state.files.redacted, retentionDays: 1 })
    if (!result.ok || !completeLine.test(result.output)) throw Error(`exit ${result.code}: ${result.output.slice(-600)}`)
    const { snapshots } = await repoA.snapshots()
    const complete = snapshots.filter(snapshot => coverageOf(snapshot).coverage === 'complete-declared')
    if (complete.length !== 1 || coverageOf(complete[0]).pending) throw Error(`expected one verified complete snapshot, got ${complete.length}`)
    ctx.state.snapshots.complete1 = complete[0].id
    return `snapshot ${complete[0].id.slice(0, 12)}`
  })
  await expect(ctx, 'backup-database-only', 'A database-only run is stored under its own coverage tag', async () => {
    const result = await run('backup: database-only run', { bucket: A.bucket, password: A.password, mode: 'database-only', configFile: ctx.state.files.redacted, retentionDays: 1 })
    if (!result.ok || !/backup run complete \(database-only\)/.test(result.output)) throw Error(`exit ${result.code}: ${result.output.slice(-600)}`)
    const { snapshots } = await repoA.snapshots()
    const only = snapshots.filter(snapshot => coverageOf(snapshot).coverage === 'database-only')
    if (only.length !== 1) throw Error(`expected one database-only snapshot, got ${only.length}`)
    ctx.state.snapshots.databaseOnly = only[0].id
  })
  let afterSecond
  await expect(ctx, 'backup-retention-scope', 'A second full backup runs with retention applied, and retention leaves the legacy and database-only snapshots untouched and no pending snapshot behind', async () => {
    const result = await run('backup: complete run 2 (retention applies)', { bucket: A.bucket, password: A.password, configFile: ctx.state.files.redacted, retentionDays: 1 })
    if (!result.ok || !completeLine.test(result.output)) throw Error(`exit ${result.code}: ${result.output.slice(-600)}`)
    afterSecond = (await repoA.snapshots()).snapshots
    const by = kind => afterSecond.filter(snapshot => coverageOf(snapshot).coverage === kind)
    const newest = [...by('complete-declared')].sort((x, y) => x.time.localeCompare(y.time)).at(-1)
    if (!newest || newest.id === ctx.state.snapshots.complete1) throw Error('the second full snapshot is not the newest verified one')
    ctx.state.snapshots.complete = newest.id
    if (!by('database-only').some(s => s.id === ctx.state.snapshots.databaseOnly)) throw Error('retention removed the database-only snapshot')
    if (!by('legacy-unknown').some(s => s.id === ctx.state.snapshots.legacy)) throw Error('retention removed the legacy snapshot')
    if (afterSecond.some(snapshot => coverageOf(snapshot).pending)) throw Error('a pending snapshot is left behind')
    return `newest verified complete: ${newest.id.slice(0, 8)}`
  })
  // Finding about the product: restic forget groups by host,paths by default, and every run backs up a new mktemp directory.
  await expect(ctx, 'backup-retention-effective', 'Retention keeps ONE daily full snapshot (BACKUP_RETENTION_DAYS=1): the older full snapshot of the same day is forgotten', async () => {
    const complete = (afterSecond ?? []).filter(snapshot => coverageOf(snapshot).coverage === 'complete-declared')
    if (complete.length > 1) throw Error(`${complete.length} full snapshots remain with different scratch paths (${complete.map(s => s.paths.join(',')).join(' vs ')}): forget groups by host,paths, so each run is its own group and nothing is ever pruned`)
  }, { finding: true })
  await expect(ctx, 'backup-integral', 'The INTEGRAL backup for real recovery is a separate repository with its own password and carries the original configuration', async () => {
    const result = await run('backup: integral run (original configuration, separate repository)', { bucket: B.bucket, password: B.password, configFile: ctx.state.files.integral, retentionDays: 14 })
    if (!result.ok || !completeLine.test(result.output)) throw Error(`exit ${result.code}: ${result.output.slice(-600)}`)
    const { snapshots } = await resticFor(ctx, { bucket: B.bucket, password: B.password }).snapshots()
    if (snapshots.length !== 1) throw Error('integral repository should hold one snapshot')
    ctx.state.snapshots.integral = snapshots[0].id
  })
  note(ctx, 'Redacted backup = rehearsal artifact (repository a). Integral backup = disaster recovery artifact (repository b, own password); its configuration is never given to a replica.')
  await ctx.source.pool.end()
  await save(ctx)
}
