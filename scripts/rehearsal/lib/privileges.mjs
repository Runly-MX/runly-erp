// A stock Supabase database already carries default privileges (anon/authenticated/service_role get everything on every new
// table in public). pg_restore creates each table under those defaults and the dump only ADDS grants, never revokes the ones
// the destination hands out by default, so a restored instance ends up MORE open than its source (observed: anon and
// authenticated with all privileges on all 304 public tables, while the source had none). Clearing the destination's default
// privileges before the restore lets the dump reinstall the source's own defaults and ACLs exactly.

const OBJECT_TYPES = { r: 'TABLES', S: 'SEQUENCES', f: 'FUNCTIONS', T: 'TYPES', n: 'SCHEMAS' }
const quote = identifier => `"${String(identifier).replaceAll('"', '""')}"`
const grantee = name => name === 'PUBLIC' ? 'PUBLIC' : quote(name)

// rows: [{ creator, schema (nullable), type, grantees: [names] }]
export function resetDefaultPrivilegesStatements(rows) {
  return rows.filter(row => OBJECT_TYPES[row.type] && row.grantees.length).map(row =>
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${quote(row.creator)}${row.schema ? ` IN SCHEMA ${quote(row.schema)}` : ''} REVOKE ALL ON ${OBJECT_TYPES[row.type]} FROM ${[...new Set(row.grantees)].map(grantee).join(', ')}`)
}

export async function readDefaultPrivileges(pool) {
  return (await pool.query(`SELECT d.defaclrole::regrole::text AS creator, n.nspname AS schema, d.defaclobjtype AS type,
    array_agg(DISTINCT CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END) AS grantees
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace, LATERAL aclexplode(d.defaclacl) a
    GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`)).rows
}

export async function resetDefaultPrivileges(pool) {
  const statements = resetDefaultPrivilegesStatements(await readDefaultPrivileges(pool))
  for (const statement of statements) await pool.query(statement)
  return { statements: statements.length, remaining: (await readDefaultPrivileges(pool)).length }
}
