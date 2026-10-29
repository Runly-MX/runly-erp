// Read-only audit of a restored Runly database for anything that could act on the outside world:
// URLs, webhooks, credentials stored in clear text, push/FCM/OAuth connections, SMTP, automations and queued deliveries.
// It never returns or prints values: only table.column names, row counts and a coarse kind. New keys do NOT neutralize
// these automatically; each finding has to be covered by a reviewed neutralization step or the gate stays closed.

const quote = identifier => `"${String(identifier).replaceAll('"', '""')}"`

// PostgreSQL ARE patterns (POSIX classes, no \b). Case-sensitive unless noted.
export const SECRET_PATTERNS = Object.freeze({
  jwt: 'eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{5,}',
  'api-key': '(sk|pk|rk)[-_](live|test)[-_][A-Za-z0-9]{16,}|sk-[A-Za-z0-9]{24,}',
  'aws-key': 'AKIA[0-9A-Z]{16}',
  'google-key': 'AIza[0-9A-Za-z_-]{35}',
  'slack-token': 'xox[abprs]-[A-Za-z0-9-]{10,}',
  'private-key': '-----BEGIN [A-Z ]*PRIVATE KEY-----',
  'url-credentials': '[a-z][a-z0-9+.-]*://[^/[:space:]:@]+:[^/[:space:]@]+@',
  'named-secret': '"(api[_-]?key|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|password|passwd|authorization)"[[:space:]]*:[[:space:]]*"[^"]{6,}"',
})
const RESERVED_HOST = '(^localhost$|^127[.]|[.]test$|[.]invalid$|[.]example$|^example[.](com|org|net)$|[.]local$|^host[.]docker[.]internal$)'
const EMAIL = '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}'
const SENSITIVE_NAME = /(token|secret|passw|api_?key|credential|p256dh|endpoint|webhook|authorization|^auth$|_auth$)/i
const ENCRYPTED_NAME = /(encrypted|ciphertext|_enc$)/i

// What a live Runly instance would actually DO with this data. Each count must be zero before API/Worker may start.
export const CAPABILITIES = Object.freeze([
  { id: 'automations-enabled', table: 'system_automation', sql: 'SELECT count(*)::int AS n FROM public.system_automation WHERE enabled' },
  { id: 'automation-webhook-tokens', table: 'system_automation', sql: 'SELECT count(*)::int AS n FROM public.system_automation WHERE webhook_token IS NOT NULL' },
  { id: 'automation-schedules-due', table: 'automation_schedule', sql: "SELECT count(*)::int AS n FROM public.automation_schedule WHERE next_run_at < now() + interval '30 days'" },
  { id: 'push-subscriptions-enabled', table: 'push_subscription', sql: 'SELECT count(*)::int AS n FROM public.push_subscription WHERE enabled' },
  { id: 'fcm-tokens-enabled', table: 'fcm_device_token', sql: 'SELECT count(*)::int AS n FROM public.fcm_device_token WHERE enabled' },
  { id: 'deliveries-pending', table: 'notification_delivery', sql: "SELECT count(*)::int AS n FROM public.notification_delivery WHERE status IN ('queued','sending')" },
  { id: 'google-connections-active', table: 'google_calendar_connection', sql: "SELECT count(*)::int AS n FROM public.google_calendar_connection WHERE status = 'ACTIVE' OR access_token_encrypted IS NOT NULL OR refresh_token_encrypted IS NOT NULL" },
  { id: 'smtp-configured', table: 'instance_config', sql: String.raw`SELECT count(*)::int AS n FROM public.instance_config WHERE key ~ '(^|:)(website[.])?smtp[.](host|pass)$' AND coalesce(value, '') <> ''` },
])

export async function auditDatabase(pool, { schema = 'public', skipTables = ['_prisma_migrations'] } = {}) {
  const columns = (await pool.query(`SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = $1 AND c.data_type IN ('text', 'character varying', 'json', 'jsonb', 'citext') ORDER BY 1, 2`, [schema])).rows
    .filter(column => !skipTables.includes(column.table_name))
  const secretKinds = Object.keys(SECRET_PATTERNS)
  const findings = []
  for (const column of columns) {
    const filters = secretKinds.map((kind, index) => `count(*) FILTER (WHERE v ~* $${index + 3})::int AS s_${index}`).join(', ')
    const sql = `SELECT count(*) FILTER (WHERE v IS NOT NULL AND v <> '' AND v NOT IN ('{}', '[]', 'null', '""'))::int AS populated,
      count(*) FILTER (WHERE v ~* 'https?://')::int AS url_rows,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM regexp_matches(v, 'https?://([^/:[:space:]"''<>?#]+)', 'gi') m WHERE m[1] !~* $1))::int AS external_host_rows,
      count(*) FILTER (WHERE v ~* $2)::int AS email_rows, ${filters}
      FROM (SELECT ${quote(column.column_name)}::text AS v FROM ${quote(schema)}.${quote(column.table_name)}) t`
    const row = (await pool.query(sql, [RESERVED_HOST, EMAIL, ...secretKinds.map(kind => SECRET_PATTERNS[kind])])).rows[0]
    const secrets = Object.fromEntries(secretKinds.map((kind, index) => [kind, row[`s_${index}`]]).filter(([, count]) => count > 0))
    const sensitiveName = SENSITIVE_NAME.test(column.column_name), encryptedName = ENCRYPTED_NAME.test(column.column_name)
    if (row.external_host_rows || row.email_rows || Object.keys(secrets).length || (sensitiveName && row.populated)) {
      findings.push({ table: column.table_name, column: column.column_name, type: column.data_type, populated: row.populated, urlRows: row.url_rows,
        externalHostRows: row.external_host_rows, emailRows: row.email_rows, secrets, sensitiveName, encryptedName })
    }
  }
  const capabilities = []
  for (const capability of CAPABILITIES) {
    const exists = (await pool.query('SELECT to_regclass($1) AS t', [`${schema}.${capability.table}`])).rows[0].t
    capabilities.push({ id: capability.id, table: capability.table, count: exists ? (await pool.query(capability.sql)).rows[0].n : 0, present: Boolean(exists) })
  }
  return { scannedColumns: columns.length, findings, capabilities }
}

// A finding is relevant for the gate when the data could carry a destination or a credential. E-mail addresses are personal
// data, not capabilities: they are reported but do not block by themselves. Ciphertext columns are opaque without the source key.
export function isRelevantFinding(finding) {
  if (finding.encryptedName && !Object.keys(finding.secrets).length && !finding.externalHostRows) return false
  return finding.externalHostRows > 0 || Object.keys(finding.secrets).length > 0 || (finding.sensitiveName && !finding.encryptedName && finding.populated > 0)
}

// `reviewed` maps "table.column" to the reason it is acceptable (normally: covered by a neutralization step).
export function auditGate(audit, { reviewed = new Map() } = {}) {
  const blocking = [], acknowledged = []
  for (const capability of audit.capabilities) if (capability.count > 0) blocking.push({ kind: 'active-capability', id: capability.id, table: capability.table, count: capability.count })
  for (const finding of audit.findings) {
    if (!isRelevantFinding(finding)) continue
    const key = `${finding.table}.${finding.column}`
    if (reviewed.has(key)) acknowledged.push({ key, reason: reviewed.get(key) })
    else blocking.push({ kind: 'unreviewed-finding', table: finding.table, column: finding.column, secrets: Object.keys(finding.secrets), externalHostRows: finding.externalHostRows })
  }
  return { pass: blocking.length === 0, blocking, acknowledged }
}
