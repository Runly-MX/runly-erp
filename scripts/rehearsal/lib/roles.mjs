// pg_dumpall --roles-only --no-role-passwords writes CREATE ROLE / ALTER ROLE / GRANT for every role of the cluster.
// A replica already has the standard Supabase roles; applying the whole file would fail on them (CREATE ROLE) or, worse,
// overwrite their attributes. This keeps only what concerns roles the replica does NOT have and never touches an existing one.

const roleName = text => text.startsWith('"') ? text.slice(1, text.lastIndexOf('"')).replaceAll('""', '"') : text

export function splitStatements(sql) {
  const statements = []
  let current = []
  for (const line of sql.split(/\r?\n/)) {
    if (!current.length && (!line.trim() || line.startsWith('--') || line.startsWith('\\') || /^SET /.test(line))) continue
    current.push(line)
    if (line.trimEnd().endsWith(';')) { statements.push(current.join('\n')); current = [] }
  }
  return statements
}

export function missingRoleStatements(sql, existingRoles) {
  const existing = new Set(existingRoles)
  const statements = splitStatements(sql)
  const missing = new Set()
  for (const statement of statements) {
    const match = /^CREATE ROLE ("(?:[^"]|"")+"|\S+?);/.exec(statement)
    if (match && !existing.has(roleName(match[1]))) missing.add(roleName(match[1]))
  }
  const selected = statements.filter(statement => {
    let match = /^CREATE ROLE ("(?:[^"]|"")+"|\S+?);/.exec(statement)
    if (match) return missing.has(roleName(match[1]))
    match = /^ALTER ROLE ("(?:[^"]|"")+"|\S+?)\s/.exec(statement)
    if (match) return missing.has(roleName(match[1]))
    match = /^GRANT ("(?:[^"]|"")+"|\S+) TO ("(?:[^"]|"")+"|\S+)/.exec(statement)
    if (match) return missing.has(roleName(match[1])) || missing.has(roleName(match[2]))
    return false
  })
  return { missing: [...missing], statements: selected }
}

// Passwords must never be in this file. This is the check the rehearsal runs on the real output.
export const exposesPasswords = sql => /\bPASSWORD\s+'/i.test(sql)
