import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createStack, startServices, attachStack, stackState } from '../lib/stack-attach.mjs'
import { seedRepresentativeSource } from '../lib/source-fixture.mjs'
import { startMinio } from '../lib/backup-flow.mjs'
import { classifyConfig } from '../lib/recoverable.mjs'
import { addSecret, expect, rand, save, GIT_BASH, runbookCommand, note } from './common.mjs'

export async function sourceStage(ctx) {
  const stack = await createStack({ apiImage: ctx.images.api })
  ctx.state.source = stackState(stack)
  await save(ctx)
  await startServices(stack)
  await stack.verifyTarget()
  await stack.initialize()
  const jwtSecret = rand(32)
  const seeded = await seedRepresentativeSource(stack, { apiImage: ctx.images.api, directory: stack.directory, jwtSecret })
  addSecret(ctx, jwtSecret, seeded.rolePassword, seeded.smtp.plaintext, ...seeded.users.map(user => user.password))
  Object.assign(ctx.state.source, {
    jwtSecret, modulesDirectory: seeded.modulesDirectory, witness: seeded.witness, smtp: seeded.smtp, rolePassword: seeded.rolePassword, notes: seeded.notes,
    companies: seeded.companies.map(company => ({ id: company.id, name: company.name, roleId: company.roleId })),
    users: seeded.users.map(user => ({ id: user.id, authId: user.authId, email: user.email, password: user.password })),
    objects: seeded.objects.map(object => ({ bucket: object.bucket, name: object.name, sha256: object.sha256, size: object.bytes.length, type: object.type, public: object.public })),
  })
  // verifyTarget/initialize left a guard schema that only this test harness uses; a real installation has none, and the backup should not carry it.
  await stack.pool.query('DROP SCHEMA IF EXISTS runly_studio_test CASCADE')
  await stack.pool.end()
  await save(ctx)
  await expect(ctx, 'source-installation', 'Source installation: certified schema, two companies, users, permissions, Storage objects, module, custom role and integration data', async () => {
    const source = await attachStack(ctx.state.source)
    try {
      const count = async sql => Number((await source.pool.query(sql)).rows[0].n)
      const facts = { migrations: await count('SELECT count(*) AS n FROM _prisma_migrations'), companies: await count('SELECT count(*) AS n FROM company'), users: await count('SELECT count(*) AS n FROM user_profile'),
        grants: await count('SELECT count(*) AS n FROM role_permission'), objects: await count('SELECT count(*) AS n FROM storage.objects'), buckets: await count('SELECT count(*) AS n FROM storage.buckets') }
      if (!(facts.migrations > 100 && facts.companies >= 2 && facts.users >= 4 && facts.objects === ctx.state.source.objects.length)) throw Error(`unexpected source facts ${JSON.stringify(facts)}`)
      return JSON.stringify(facts)
    } finally { await source.pool.end() }
  })
  await save(ctx)
}

// MinIO destination, a "production-shaped" integral configuration, and the documented redaction/filter commands.
export async function prepareStage(ctx) {
  const source = await attachStack(ctx.state.source)
  const minio = await startMinio({ log: ctx.log, directory: ctx.work, token: ctx.runId.slice(-8) })
  ctx.minio = minio
  ctx.state.minio = { name: minio.name, user: minio.user, password: minio.password, port: minio.port }
  addSecret(ctx, minio.password)
  ctx.state.repos = {}
  for (const key of ['a', 'b']) {
    const repo = { bucket: `rehearsal-${key}`, password: rand(24) }
    addSecret(ctx, repo.password); await minio.makeBucket(repo.bucket); ctx.state.repos[key] = repo
  }
  const production = { anon: source.secret.SUPABASE_ANON_KEY, service: source.secret.SUPABASE_SERVICE_ROLE_KEY, jwt: source.secret.SUPABASE_JWT_SECRET }
  const synthetic = { groq: `gsk_${rand(20)}`, tavily: `tvly-${rand(16)}`, google: rand(16), prodRestic: rand(16), prodBackup: rand(16), prodStorage: rand(16), internal: rand(24), googleKey: Buffer.from(rand(16), 'hex').toString('base64') }
  addSecret(ctx, ...Object.values(synthetic))
  const env = [
    ['RUNLY_INSTANCE_ID', ctx.instanceId], ['DATABASE_URL', source.databaseUrl], ['DIRECT_URL', source.databaseUrl], ['SUPABASE_URL', 'http://supabase-kong:8000'],
    ['SUPABASE_ANON_KEY', production.anon], ['SUPABASE_SERVICE_ROLE_KEY', production.service], ['SUPABASE_JWT_SECRET', production.jwt], ['JWT_SECRET', ctx.state.source.jwtSecret],
    ['RUNLY_INTERNAL_SECRET', synthetic.internal], ['SMTP_HOST', 'smtp.example.test'], ['SMTP_USER', 'mailer@example.test'], ['SMTP_PASS', rand(8)], ['GROQ_API_KEY', synthetic.groq], ['TAVILY_API_KEY', synthetic.tavily],
    ['GOOGLE_OAUTH_CLIENT_SECRET', synthetic.google], ['GOOGLE_OAUTH_ENCRYPTION_KEY', synthetic.googleKey], ['RUNLY_API_PORT', '4010'], ['RUNLY_API_IMAGE', 'repo/runly:api-example'], ['LIVEKIT_MODE', 'disabled'],
    ['RUNLY_MCP_ENABLED', 'true'], ['BACKUP_MODE', 'enabled'], ['BACKUP_COVERAGE_MODE', 'complete'], ['BACKUP_MAX_AGE_HOURS', '36'], ['BACKUP_S3_ENDPOINT', 'https://s3.production.example.test'],
    ['BACKUP_S3_BUCKET', 'production-backups'], ['BACKUP_S3_ACCESS_KEY_ID', `prod${rand(6)}`], ['BACKUP_S3_SECRET_ACCESS_KEY', synthetic.prodBackup], ['RESTIC_PASSWORD', synthetic.prodRestic],
    ['BACKUP_STORAGE_S3_ENDPOINT', 'https://supabase.production.example.test/storage/v1/s3'], ['BACKUP_STORAGE_S3_ACCESS_KEY_ID', rand(8)], ['BACKUP_STORAGE_S3_SECRET_ACCESS_KEY', synthetic.prodStorage],
  ]
  await writeFile(join(ctx.work, '.env.external'), env.map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
  ctx.state.synthetic = { ...synthetic, smtpEnvSecret: env.find(([key]) => key === 'SMTP_PASS')[1] }
  addSecret(ctx, ctx.state.synthetic.smtpEnvSecret)
  // The two commands below are copied out of the runbook (B.2 and B.3), not retyped here.
  const awk = await runbookCommand(/awk -F= '[^\n]*env\.external\.redactada/)
  const filter = await runbookCommand(/grep -v -E '\^\(BACKUP_\|RESTIC_\|SMTP_\)' \.env\.external > env\.sin-respaldo/)
  const survivors = await runbookCommand(/grep -E -c '[^\n]*' env\.external\.redactada/)
  const noBackup = await runbookCommand(/grep -c -E '\^\(BACKUP_\|RESTIC_\|SMTP_\)' env\.sin-respaldo/)
  const bash = (label, script) => ctx.log.attempt(label, GIT_BASH, ['-c', script], { cwd: ctx.work })
  const redacted = await bash('runbook B.2: redact the configuration copy', awk)
  const filtered = await bash('runbook B.3: drop BACKUP_*/RESTIC_*/SMTP_* from the container environment', filter)
  const survivorCount = await bash('runbook B.2: count surviving secrets (must be 0)', survivors)
  const backupCount = await bash('runbook B.3: count BACKUP_/RESTIC_/SMTP_ variables left (must be 0)', noBackup)
  ctx.state.files = { integral: join(ctx.work, '.env.external'), redacted: join(ctx.work, 'env.external.redactada'), withoutBackup: join(ctx.work, 'env.sin-respaldo') }
  await expect(ctx, 'config-redaction', 'Runbook B.2/B.3 commands: the redacted copy keeps no secret and the container environment carries no production backup or mail variable', async () => {
    if (redacted.code !== 0 || filtered.code !== 0) throw Error(`commands failed: ${redacted.output} ${filtered.output}`)
    if (survivorCount.output.trim() !== '0') throw Error(`secrets survive in the redacted copy: ${survivorCount.output.trim()}`)
    if (backupCount.output.trim() !== '0') throw Error(`BACKUP_/RESTIC_/SMTP_ variables remain: ${backupCount.output.trim()}`)
    const text = await readFile(ctx.state.files.redacted, 'utf8'), integral = await readFile(ctx.state.files.integral, 'utf8')
    const leaked = [...ctx.state.secrets].filter(secret => secret.length >= 8 && text.includes(secret))
    if (leaked.length) throw Error(`${leaked.length} known secret value(s) appear in the redacted copy`)
    if (classifyConfig(text) !== 'redacted' || classifyConfig(integral) !== 'integral') throw Error(`classification: redacted=${classifyConfig(text)} integral=${classifyConfig(integral)}`)
    return `redacted=${classifyConfig(text)} integral=${classifyConfig(integral)}; names kept: ${text.split('\n').filter(line => /^[A-Z_]+=.+/.test(line)).map(line => line.split('=')[0]).join(',')}`
  })
  note(ctx, 'The redacted copy keeps RUNLY_INSTANCE_ID, modes, ports and image tags; every secret, URL, bucket, host, e-mail and endpoint value is emptied.')
  await mkdir(join(ctx.work, 'legacy'), { recursive: true })
  await writeFile(join(ctx.work, 'legacy', 'old-style-backup.txt'), 'snapshot from before coverage manifests\n')
  await source.pool.end()
  await save(ctx)
}
