// Runs the S3 + MinIO + restic recovery integration with its gate enabled and fails if it was skipped.
// Needs local images runly-backup-recovery:verification, minio/minio:latest and postgres:17-alpine
// (build: docker build -f infra/docker/backup.Dockerfile -t runly-backup-recovery:verification .).
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertExecuted } from './lib/node-test-summary.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const run = spawnSync(process.execPath, ['--test', 'scripts/recovery/__tests__/recovery-s3.integration.test.mjs'], {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, RUN_RECOVERY_S3_TESTS: '1' },
})
process.stdout.write(run.stdout ?? '')
process.stderr.write(run.stderr ?? '')
try {
  if (run.status !== 0) throw new Error(`node --test exited ${run.status}`)
  console.log(`recovery S3 integration executed: ${assertExecuted(run.stdout).pass} passed`)
} catch (error) {
  console.error(`recovery S3 integration FAILED: ${error.message}`)
  process.exitCode = 1
}
