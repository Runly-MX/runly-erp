import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { attachStack } from '../lib/stack-attach.mjs'
import { auditDatabase, auditGate } from '../lib/audit-data.mjs'
import { NEUTRALIZATION_STEPS, neutralizeReplica, reviewedFrom } from '../lib/neutralize.mjs'
import { collectInventory, diffInventories } from '../lib/inventory.mjs'
import { hashTree } from '../lib/tree.mjs'
import { expect, note, save } from './common.mjs'
import { sourceInventoryFile } from './verify.mjs'

const summarize = audit => audit.findings.map(f => `${f.table}.${f.column}${Object.keys(f.secrets).length ? `[${Object.keys(f.secrets).join('+')}]` : ''}${f.externalHostRows ? '[url]' : ''}`).join(', ')

// New keys do not neutralize everything: audit the restored copy for URLs, webhooks, clear-text credentials, automations and queues,
// close the known ones, and keep the gate shut on anything nobody has reviewed. The backup and the source are never modified.
export async function auditStage(ctx) {
  const replica = await attachStack(ctx.state.replica)
  const source = await attachStack(ctx.state.source)
  const extractRoot = ctx.state.extractRoot
  const beforeBackup = await hashTree(extractRoot)
  const sourceInventory = JSON.parse(await readFile(sourceInventoryFile(ctx), 'utf8'))
  const reviewed = reviewedFrom(NEUTRALIZATION_STEPS)

  let first
  await expect(ctx, 'audit-finds-capabilities', 'The audit of the restored copy finds what can act on the outside: enabled automation, queued delivery, push/FCM, OAuth connection, SMTP, schedules, clear-text credentials and an unknown integration table', async () => {
    first = await auditDatabase(replica.pool)
    await writeFile(join(ctx.runDir, 'audit-before.json'), JSON.stringify(first, null, 2))
    const active = first.capabilities.filter(c => c.count > 0).map(c => c.id)
    const expectedActive = ['automations-enabled', 'automation-webhook-tokens', 'automation-schedules-due', 'push-subscriptions-enabled', 'fcm-tokens-enabled', 'deliveries-pending', 'google-connections-active', 'smtp-configured']
    const missing = expectedActive.filter(id => !active.includes(id))
    if (missing.length) throw Error(`the audit missed active capabilities: ${missing.join(', ')}`)
    const tables = new Set(first.findings.map(f => f.table))
    for (const table of ['cm_rehearsal_hook', 'system_automation', 'push_subscription', 'fcm_device_token', 'instance_config']) if (!tables.has(table)) throw Error(`no finding in ${table}`)
    return `${active.length} active capabilities; findings in: ${summarize(first)}`.slice(0, 600)
  })

  await expect(ctx, 'gate-closed-before', 'The gate is CLOSED on the raw restored copy', async () => {
    const gate = auditGate(first, { reviewed })
    if (gate.pass) throw Error('the gate would open on an un-neutralized copy')
    return `${gate.blocking.length} blocking item(s)`
  })

  let report
  await expect(ctx, 'neutralize-known', 'Known integrations are neutralized in the COPY in one transaction (disabled, tokens removed, deliveries cancelled, OAuth revoked, SMTP removed); business rows are untouched', async () => {
    const before = (await replica.pool.query("SELECT (SELECT count(*) FROM notes)::int AS notes, (SELECT count(*) FROM file_asset)::int AS files, (SELECT count(*) FROM user_profile)::int AS users, (SELECT count(*) FROM membership)::int AS memberships, (SELECT count(*) FROM role_permission)::int AS grants")).rows[0]
    report = await neutralizeReplica(replica.pool, { expectedDatabase: 'postgres' })
    const after = (await replica.pool.query("SELECT (SELECT count(*) FROM notes)::int AS notes, (SELECT count(*) FROM file_asset)::int AS files, (SELECT count(*) FROM user_profile)::int AS users, (SELECT count(*) FROM membership)::int AS memberships, (SELECT count(*) FROM role_permission)::int AS grants")).rows[0]
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error(`business rows changed: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
    await writeFile(join(ctx.runDir, 'neutralization-report.json'), JSON.stringify(report, null, 2))
    return report.map(step => `${step.id}:${step.rows}`).join(' ')
  })

  let second
  await expect(ctx, 'gate-still-closed', 'After the known steps the gate STAYS CLOSED because of the integration table no list knew about (unreviewed)', async () => {
    second = await auditDatabase(replica.pool)
    const gate = auditGate(second, { reviewed })
    if (gate.pass) throw Error('the gate opened although an unreviewed integration table remains')
    const remaining = gate.blocking.map(b => b.kind === 'active-capability' ? b.id : `${b.table}.${b.column}`)
    if (!remaining.some(item => item.startsWith('cm_rehearsal_hook.'))) throw Error(`expected the unknown table to block; blocking: ${remaining.join(', ')}`)
    if (gate.blocking.some(b => b.kind === 'active-capability')) throw Error(`an active capability survived the neutralization: ${remaining.join(', ')}`)
    return `blocking: ${remaining.join(', ')}`
  })

  await expect(ctx, 'review-unknown-table', 'A reviewer adds an explicit step for the unknown table; the gate then opens and every acknowledged column carries its reason', async () => {
    const steps = [...NEUTRALIZATION_STEPS, { id: 'cm-rehearsal-hook-cleared', table: 'cm_rehearsal_hook', sql: 'UPDATE public.cm_rehearsal_hook SET callback_url = NULL, api_key = NULL',
      covers: [['cm_rehearsal_hook', 'callback_url', 'destination removed'], ['cm_rehearsal_hook', 'api_key', 'credential removed']] }]
    const extra = await neutralizeReplica(replica.pool, { steps: [steps.at(-1)], expectedDatabase: 'postgres' })
    const third = await auditDatabase(replica.pool)
    await writeFile(join(ctx.runDir, 'audit-after.json'), JSON.stringify(third, null, 2))
    const gate = auditGate(third, { reviewed: reviewedFrom(steps) })
    if (!gate.pass) throw Error(`gate still closed: ${JSON.stringify(gate.blocking)}`)
    ctx.state.gate = { acknowledged: gate.acknowledged, extraStep: extra[0] }
    return `gate open; ${gate.acknowledged.length} acknowledged finding(s) with reasons; rows changed in the reviewed table: ${extra[0].rows}`
  })

  await expect(ctx, 'no-secret-left-in-instance-config', 'After neutralization no credential pattern remains in instance_config.value (the column the gate acknowledges)', async () => {
    const left = (await auditDatabase(replica.pool)).findings.find(f => f.table === 'instance_config' && f.column === 'value')
    if (left && (Object.keys(left.secrets).length || left.externalHostRows)) throw Error(`instance_config.value still has ${Object.keys(left.secrets).join('+') || 'external hosts'}`)
    return 'clean'
  })

  await expect(ctx, 'backup-and-source-untouched', 'Neutralization changed only the replica: the extracted backup is byte-identical and the source inventory is unchanged', async () => {
    const afterBackup = await hashTree(extractRoot)
    for (const [key, value] of beforeBackup) if (afterBackup.get(key)?.sha256 !== value.sha256) throw Error(`the extracted backup changed: ${key}`)
    const sourceNow = await collectInventory({ pool: source.pool, admin: source.admin })
    const differences = diffInventories(sourceInventory, sourceNow)
    if (differences.length) throw Error(`the source changed: ${differences.slice(0, 3).map(d => d.section).join(', ')}`)
    return `${beforeBackup.size} backup files and ${Object.keys(sourceNow.tables).length} source tables unchanged`
  })

  const text = await readFile(join(ctx.state.replica.directory, 'test.env'), 'utf8')
  await expect(ctx, 'replica-has-no-source-secrets', 'No secret of the source installation exists anywhere in the replica configuration', async () => {
    const sourceSecrets = [ctx.state.source.jwtSecret, ctx.state.synthetic.groq, ctx.state.synthetic.tavily, ctx.state.synthetic.prodRestic, ctx.state.synthetic.prodBackup, ctx.state.synthetic.smtpEnvSecret, ctx.state.minio.password, ctx.state.repos.a.password, ctx.state.repos.b.password]
    const found = sourceSecrets.filter(secret => text.includes(secret))
    if (found.length) throw Error(`${found.length} source secret(s) present in the replica environment`)
    return 'none of the source JWT secret, AI keys, backup password or SMTP password is present'
  })
  note(ctx, 'Not neutralized by design: e-mail addresses (personal data, reported only), ciphertext columns (opaque without the source keys), and the clear-text automation definition and webhook URLs, which stay in the copy disabled and unreachable behind the isolation gate.')
  await replica.pool.end(); await source.pool.end()
  await save(ctx)
}
