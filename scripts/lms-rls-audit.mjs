// Read-only audit of the runly.lms tables (spec 2026-11-21 section 4): per table,
// RLS on/off, owner and whether the Supabase client roles can read or write it,
// plus the attributes of the role this connection uses. Prints no row data.
// Usage: node --env-file=.env scripts/lms-rls-audit.mjs   (exit 1 when a client role has access)
import pg from 'pg'

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.error('DIRECT_URL or DATABASE_URL is required.')
  process.exit(2)
}

const CLIENT_ROLES = ['anon', 'authenticated']
const pool = new pg.Pool({ connectionString: url, max: 1 })
try {
  const role = (await pool.query(`SELECT current_user AS name, rolsuper AS superuser, rolbypassrls AS bypass_rls FROM pg_roles WHERE rolname = current_user`)).rows[0]
  const existing = new Set((await pool.query(`SELECT rolname FROM pg_roles WHERE rolname = ANY($1)`, [CLIENT_ROLES])).rows.map((r) => r.rolname))
  const roles = CLIENT_ROLES.filter((name) => existing.has(name))
  const privilegeColumns = roles.flatMap((name) => [
    `has_table_privilege('${name}', c.oid, 'SELECT') AS "${name}_select"`,
    `has_table_privilege('${name}', c.oid, 'INSERT,UPDATE,DELETE') AS "${name}_write"`,
  ])
  const tables = (await pool.query(`
    SELECT c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls, pg_get_userbyid(c.relowner) AS owner
      ${privilegeColumns.length ? `, ${privilegeColumns.join(', ')}` : ''}
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'lms\\_%'
    ORDER BY c.relname`)).rows

  console.log('connection role:', JSON.stringify(role))
  console.log('client roles present:', roles.join(', ') || 'none')
  console.table(tables)
  const exposed = tables.filter((row) => roles.some((name) => row[`${name}_select`] || row[`${name}_write`]))
  const withoutRls = tables.filter((row) => !row.rls)
  console.log(`tables: ${tables.length}, without RLS: ${withoutRls.length}, readable or writable by a client role: ${exposed.length}`)
  if (role && !role.superuser && !role.bypass_rls && tables.some((row) => row.owner !== role.name)) {
    console.log('warning: the connection role does not own every table and does not bypass RLS; enabling RLS would block it.')
  }
  process.exitCode = exposed.length ? 1 : 0
} finally {
  await pool.end()
}
