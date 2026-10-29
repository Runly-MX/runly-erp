import { join } from 'node:path'
import { sha256 } from '../lib/tree.mjs'
import { recoveryCli, recoveryConfig } from '../lib/backup-flow.mjs'
import { expect, GIT_BASH, runbookCommand, save } from './common.mjs'
import { useSource } from './backup.mjs'

// The read-only diagnostic of the runbook (Part 1) against the rehearsal repository: the exact commands, positive cases, and a
// repository-level proof that none of them writes anything.
export async function diagnosticStage(ctx) {
  await useSource(ctx)
  const A = ctx.state.repos.a
  const listRepository = async () => {
    const result = await ctx.log.attempt('mc ls: list every object of the repository (read-only)', 'docker', ['run', '--rm', '--env-file', join(ctx.work, 'mc.env'), '--entrypoint', '/usr/bin/mc', 'minio/minio:latest', 'ls', '--recursive', `t/${A.bucket}`])
    if (result.code !== 0) throw Error(`could not list the repository: ${result.output.slice(0, 200)}`)
    return result.output
  }
  const before = await listRepository()

  await expect(ctx, 'diagnostic-presence-only', 'Runbook A.2 (1): the presence-only command names the backup variables and whether they hold a value, and never prints a value', async () => {
    const command = await runbookCommand(/awk -F= '\/\^\(BACKUP_MODE[^\n]*\.env\.external/)
    const result = await ctx.log.attempt('runbook A.2: presence-only check of the backup variables', GIT_BASH, ['-c', command], { cwd: ctx.work })
    if (result.code !== 0) throw Error(`exit ${result.code}: ${result.output.slice(0, 200)}`)
    const lines = result.output.trim().split(/\r?\n/)
    if (!lines.some(line => /^BACKUP_MODE definido$/.test(line)) || !lines.some(line => /^RESTIC_PASSWORD definido$/.test(line))) throw Error(`unexpected output: ${result.output.slice(0, 200)}`)
    if (!lines.every(line => /^[A-Z0-9_]+ (definido|VACIO)$/.test(line))) throw Error('a line has an unexpected shape')
    // The log masks known secrets, so also check the raw value of the production-like restic password against the unmasked output.
    const raw = (await ctx.log.attempt('runbook A.2 (raw output, for the leak test only)', GIT_BASH, ['-c', command], { cwd: ctx.work })).output
    if (raw.includes(ctx.state.synthetic.prodRestic) || raw.includes(ctx.state.synthetic.prodBackup)) throw Error('a secret value was printed')
    return `${lines.length} variables reported: ${lines.slice(0, 4).join(', ')}...`
  })

  await expect(ctx, 'diagnostic-verify-backup', 'Runbook A.2 (4): verify-backup.sh in complete mode accepts the healthy repository (exit 0) and prints only fixed text', async () => {
    const result = await ctx.log.attempt('verify-backup.sh against the healthy repository (complete mode)', 'docker', ['run', '--rm', '--add-host', 'host.docker.internal:host-gateway', '--env-file', ctx.envWithoutBackup,
      '-e', `BACKUP_S3_ENDPOINT=${ctx.minio.containerEndpoint}`, '-e', `BACKUP_S3_BUCKET=${A.bucket}`, '-e', `BACKUP_S3_ACCESS_KEY_ID=${ctx.minio.user}`, '-e', `BACKUP_S3_SECRET_ACCESS_KEY=${ctx.minio.password}`,
      '-e', `RESTIC_PASSWORD=${A.password}`, '-e', 'BACKUP_COVERAGE_MODE=complete', ctx.backupImage, './verify-backup.sh'])
    if (result.code !== 0 || !/\[verify\] OK: verified complete snapshot within \d+ hours/.test(result.output)) throw Error(`exit ${result.code}: ${result.output.slice(-300)}`)
    return result.output.trim().split(/\r?\n/).at(-1)
  })

  await expect(ctx, 'diagnostic-inspect', 'Runbook A.1: the recovery CLI lists the snapshots of the healthy repository with their coverage', async () => {
    const config = await recoveryConfig(ctx, { bucket: A.bucket, password: A.password, file: join(ctx.work, 'recovery-a.env') })
    const result = await recoveryCli(ctx, ['inspect', '--config', config])
    if (result.code !== 0 || !/complete-declared/.test(result.output)) throw Error(`exit ${result.code}: ${result.output.slice(0, 200)}`)
    return `exit 0; ${(result.output.match(/"coverage"/g) ?? []).length} snapshots classified`
  })

  await expect(ctx, 'diagnostic-writes-nothing', 'The whole diagnostic wrote nothing: every object of the repository (name, size, modification time) is identical before and after', async () => {
    const after = await listRepository()
    if (sha256(before) !== sha256(after)) throw Error('the repository listing changed during the diagnostic')
    return `${before.trim().split(/\r?\n/).length} objects unchanged`
  })
  await ctx.source.pool.end()
  await save(ctx)
}
