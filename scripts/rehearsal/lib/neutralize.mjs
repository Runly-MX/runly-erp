// Neutralization of a RESTORED COPY only. The backup and the source are never touched. Every step is a reviewed SQL
// statement with the columns it makes harmless ("covers"), so the audit gate can tell reviewed data from new, unknown data.
// Business rows (notes, files, users, companies, permissions) are never modified or deleted.

export const NEUTRALIZATION_STEPS = Object.freeze([
  { id: 'automations-disabled', table: 'system_automation', sql: 'UPDATE public.system_automation SET enabled = false, webhook_token = NULL',
    covers: [['system_automation', 'definition', 'definition kept for comparison; the automation is disabled and its webhook token removed'], ['system_automation', 'webhook_token', 'removed']] },
  { id: 'automation-schedules-parked', table: 'automation_schedule', sql: "UPDATE public.automation_schedule SET next_run_at = '9999-12-31T00:00:00Z'", covers: [] },
  { id: 'push-subscriptions-disabled', table: 'push_subscription', sql: 'UPDATE public.push_subscription SET enabled = false',
    covers: [['push_subscription', 'endpoint', 'subscription disabled'], ['push_subscription', 'p256dh', 'subscription disabled'], ['push_subscription', 'auth', 'subscription disabled']] },
  { id: 'fcm-tokens-disabled', table: 'fcm_device_token', sql: 'UPDATE public.fcm_device_token SET enabled = false', covers: [['fcm_device_token', 'token', 'token disabled']] },
  { id: 'deliveries-cancelled', table: 'notification_delivery', sql: "UPDATE public.notification_delivery SET status = 'cancelled' WHERE status IN ('queued', 'sending')", covers: [] },
  { id: 'google-connections-revoked', table: 'google_calendar_connection',
    sql: "UPDATE public.google_calendar_connection SET status = 'REVOKED', access_token_encrypted = NULL, refresh_token_encrypted = NULL, revoked_at = now()", covers: [] },
  { id: 'smtp-configuration-removed', table: 'instance_config', sql: String.raw`DELETE FROM public.instance_config WHERE key ~ '(^|:)(website[.])?smtp[.]'`, covers: [] },
  { id: 'integration-credentials-removed', table: 'instance_config', sql: String.raw`DELETE FROM public.instance_config WHERE key ~* '(api_?key|secret|token|passw|credential)'`,
    covers: [['instance_config', 'value', 'instance-level credentials removed; the audit must show no secret left in this column']] },
])

export function reviewedFrom(steps) {
  return new Map(steps.flatMap(step => step.covers.map(([table, column, reason]) => [`${table}.${column}`, `${step.id}: ${reason}`])))
}

// One transaction: either every step applies or none. Returns affected rows per step; steps whose table is absent are skipped.
export async function neutralizeReplica(pool, { steps = NEUTRALIZATION_STEPS, expectedDatabase } = {}) {
  const client = await pool.connect()
  const report = []
  try {
    if (expectedDatabase) {
      const current = (await client.query('SELECT current_database() AS d')).rows[0].d
      if (current !== expectedDatabase) throw Error('NEUTRALIZATION_TARGET_MISMATCH')
    }
    await client.query('BEGIN')
    for (const step of steps) {
      const present = (await client.query('SELECT to_regclass($1) AS t', [`public.${step.table}`])).rows[0].t
      if (!present) { report.push({ id: step.id, table: step.table, rows: 0, skipped: true }); continue }
      report.push({ id: step.id, table: step.table, rows: (await client.query(step.sql)).rowCount, skipped: false })
    }
    await client.query('COMMIT')
    return report
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error } finally { client.release() }
}
