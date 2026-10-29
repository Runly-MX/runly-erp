// Backup and recovery rehearsal with disposable resources only (Docker, a local MinIO, two Supabase stacks).
//   node scripts/rehearsal/verify-backup-restore.mjs --api-image=<certified api> --worker-image=<certified worker> --backup-image=<backup image> \
//        [--run=<id>] [--stage=source,prepare,backup,verify,diagnostic,roles,replica,audit,isolation,failures,all] [--keep]
// Stages can be run one at a time against the same run (state is kept in .artifacts/rehearsal/run-<id>/state.json).
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createContext, record, save } from './stages/common.mjs'

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true] }))
const ALL = ['source', 'prepare', 'backup', 'verify', 'diagnostic', 'roles', 'replica', 'audit', 'isolation', 'failures']
const wanted = (args.stage ?? 'all') === 'all' ? ALL : String(args.stage).split(',')
const loaders = {
  source: async () => (await import('./stages/source.mjs')).sourceStage, prepare: async () => (await import('./stages/source.mjs')).prepareStage,
  backup: async () => (await import('./stages/backup.mjs')).backupStage, verify: async () => (await import('./stages/verify.mjs')).verifyStage,
  diagnostic: async () => (await import('./stages/diagnostic.mjs')).diagnosticStage,
  roles: async () => (await import('./stages/restore.mjs')).rolesStage, replica: async () => (await import('./stages/restore.mjs')).replicaStage,
  audit: async () => (await import('./stages/audit.mjs')).auditStage, isolation: async () => (await import('./stages/isolation.mjs')).isolationStage,
  failures: async () => (await import('./stages/failures.mjs')).failuresStage,
}
const ctx = await createContext(args)
console.log(`RUN ${ctx.runId}`)
for (const stage of wanted) {
  if (!loaders[stage]) throw Error(`unknown stage ${stage}`)
  console.log(`\n== stage ${stage}`)
  try { await (await loaders[stage]())(ctx) } catch (error) { record(ctx, `stage-${stage}`, `Stage ${stage} completed`, false, error.stack ?? error.message) }
  await save(ctx)
}
const failed = ctx.state.checks.filter(check => !check.ok && !check.finding), findings = ctx.state.checks.filter(check => !check.ok && check.finding)
await writeFile(join(ctx.runDir, 'report.json'), JSON.stringify({ runId: ctx.runId, images: ctx.images, checks: ctx.state.checks, notes: ctx.state.notes, commands: ctx.state.commands }, null, 2))
console.log(`\nRESULT ${ctx.state.checks.filter(check => check.ok).length}/${ctx.state.checks.length} checks passed, ${findings.length} finding(s) about the product, ${failed.length} failure(s); report: ${join(ctx.runDir, 'report.json')}`)
for (const check of findings) console.log(`  FINDING ${check.id}: ${check.detail.split('\n')[0].slice(0, 220)}`)
for (const check of failed) console.log(`  FAILED ${check.id}: ${check.detail.split('\n')[0].slice(0, 200)}`)
process.exit(failed.length ? 1 : 0)
