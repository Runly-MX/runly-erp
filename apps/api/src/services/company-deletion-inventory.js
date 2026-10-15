// Catalog-driven ownership covers core and installed/uninstalled RME3 tables.
// Keys, never full business rows, survive partial purges for retries.
export function quoteIdentifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error('UNSAFE_LIFECYCLE_IDENTIFIER')
  return `"${value}"`
}

export async function catalog(db) {
  const tables = await db.$queryRawUnsafe(`SELECT c.relname AS name,
    array_agg(a.attname::text ORDER BY a.attnum) AS columns,
    array_agg(a.attname::text ORDER BY a.attnum) FILTER (WHERE a.attnum = ANY(i.indkey)) AS pk
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
    GROUP BY c.oid, c.relname`)
  const foreignKeys = await db.$queryRawUnsafe(`SELECT child.relname AS child, parent.relname AS parent,
    array_agg(ca.attname::text ORDER BY k.ord) AS "childColumns",
    array_agg(pa.attname::text ORDER BY k.ord) AS "parentColumns", bool_and(NOT ca.attnotnull) AS nullable, c.condeferrable AS deferrable
    FROM pg_constraint c JOIN pg_class child ON child.oid = c.conrelid JOIN pg_namespace cn ON cn.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = c.confrelid JOIN pg_namespace pn ON pn.oid = parent.relnamespace
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(ch, pr, ord)
    JOIN pg_attribute ca ON ca.attrelid = child.oid AND ca.attnum = k.ch
    JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = k.pr
    WHERE c.contype = 'f' AND cn.nspname = 'public' AND pn.nspname = 'public'
    GROUP BY c.oid, child.relname, parent.relname`)
  if (tables.some(t => t.name === 'chat_conversations')) for (const table of tables) {
    if (table.columns.includes('conversation_id') && !foreignKeys.some(f => f.child === table.name && f.parent === 'chat_conversations')) {
      foreignKeys.push({ child: table.name, parent: 'chat_conversations', childColumns: ['conversation_id'], parentColumns: ['id'], logical: true })
    }
  }
  for (const table of tables) { quoteIdentifier(table.name); table.columns.forEach(quoteIdentifier); table.pk?.forEach(quoteIdentifier) }
  return { tables, foreignKeys }
}

function keyExpression(table, alias = 'r') {
  // No key means we cannot promise safe resumability.
  if (!table.pk?.length) throw new Error('UNKEYED_COMPANY_TABLE')
  return `jsonb_build_object(${table.pk.map(key => `'${key}', ${alias}.${quoteIdentifier(key)}`).join(', ')})`
}

async function addRows(db, companyId, table, predicate, parameters = []) {
  const count = await db.$executeRawUnsafe(`INSERT INTO runly_lifecycle.deletion_row(company_id, table_name, row_key)
    SELECT $1::uuid, '${table.name}', ${keyExpression(table)} FROM public.${quoteIdentifier(table.name)} r
    WHERE ${predicate} ON CONFLICT DO NOTHING`, companyId, ...parameters)
  return Number(count)
}

export async function inventoryCompany(db, companyId) {
  const { tables, foreignKeys } = await catalog(db)
  const byName = new Map(tables.map(t => [t.name, t]))
  for (const table of tables) {
    if (table.name === 'company') continue
    if (table.columns.includes('company_id')) await addRows(db, companyId, table, 'r.company_id = $1::uuid')
  }
  const files = byName.get('file_asset')
  if (files) await addRows(db, companyId, files, 'r.entity_id = $1::uuid')
  // Propagate owned parents to children irrespective of CASCADE/RESTRICT/SET NULL.
  // Never walk from a membership to its global user or from enablement to a
  // shared module. A child carrying a DIFFERENT company is a conflict, not ours.
  for (let pass = 0; pass < tables.length + 1; pass += 1) {
    let added = 0
    for (const fk of foreignKeys) {
      if (fk.parent === 'company' || !byName.has(fk.child)) continue
      const table = byName.get(fk.child)
      const join = fk.childColumns.map((col, i) => `r.${quoteIdentifier(col)} = p.${quoteIdentifier(fk.parentColumns[i])}`).join(' AND ')
      const parent = `EXISTS (SELECT 1 FROM public.${quoteIdentifier(fk.parent)} p JOIN runly_lifecycle.deletion_row d
        ON d.company_id = $1::uuid AND d.table_name = '${fk.parent}' AND to_jsonb(p) @> d.row_key WHERE ${join})`
      if (table.columns.includes('company_id')) {
        const [conflict] = await db.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM public.${quoteIdentifier(table.name)} r WHERE r.company_id IS DISTINCT FROM $1::uuid AND ${parent}) AS found`, companyId)
        if (conflict.found) throw new Error('CROSS_COMPANY_REFERENCE')
      }
      // Skip unkeyed tables if they have no owned rows.
      const [present] = await db.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM public.${quoteIdentifier(table.name)} r WHERE ${parent}) AS found`, companyId)
      if (present.found) added += await addRows(db, companyId, table, parent)
    }
    if (files) added += await addRows(db, companyId, files, `EXISTS (SELECT 1 FROM runly_lifecycle.deletion_row d
      WHERE d.company_id = $1::uuid AND d.row_key->>'id' = r.entity_id::text)`)
    if (!added) break
    if (pass === tables.length) throw new Error('INVENTORY_DID_NOT_CONVERGE')
  }
  // Current objects AND Office recovery versions. Persist before metadata dies.
  for (const table of tables.filter(t => t.columns.includes('bucket') && t.columns.includes('object_key'))) {
    const name = table.name
    await db.$executeRawUnsafe(`INSERT INTO runly_lifecycle.deletion_object(company_id, bucket, object_key)
      SELECT $1::uuid, r.bucket, r.object_key FROM public.${quoteIdentifier(name)} r JOIN runly_lifecycle.deletion_row d
      ON d.company_id = $1::uuid AND d.table_name = '${name}' AND to_jsonb(r) @> d.row_key
      WHERE r.object_key IS NOT NULL ON CONFLICT DO NOTHING`, companyId)
  }
  for (const table of tables.filter(t => t.columns.includes('bucket') && t.columns.includes('object_key'))) {
    const name = table.name
    const [shared] = await db.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM public.${quoteIdentifier(name)} r
      JOIN runly_lifecycle.deletion_object o ON o.company_id=$1::uuid AND o.bucket=r.bucket AND o.object_key=r.object_key
      WHERE NOT EXISTS(SELECT 1 FROM runly_lifecycle.deletion_row d WHERE d.company_id=$1::uuid AND d.table_name=$2 AND to_jsonb(r) @> d.row_key)) AS found`, companyId, name)
    if (shared.found) throw new Error('CROSS_COMPANY_REFERENCE')
  }
  return { tables, foreignKeys }
}

export async function purgeCompanyRows(db, companyId) {
  const { tables, foreignKeys } = await catalog(db)
  const pending = new Set((await db.$queryRawUnsafe('SELECT DISTINCT table_name FROM runly_lifecycle.deletion_row WHERE company_id = $1::uuid', companyId)).map(r => r.table_name))
  await db.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
  for (const fk of foreignKeys) if (fk.nullable && pending.has(fk.child) && pending.has(fk.parent)) {
    await db.$executeRawUnsafe(`UPDATE public.${quoteIdentifier(fk.child)} r SET ${fk.childColumns.map(c => `${quoteIdentifier(c)} = NULL`).join(', ')}
      FROM runly_lifecycle.deletion_row d WHERE d.company_id = $1::uuid AND d.table_name = $2 AND to_jsonb(r) @> d.row_key`, companyId, fk.child)
  }
  // Children first; deferred/self FKs are left to PostgreSQL. Cycles across
  // tables fail closed instead of disabling constraints or deleting foreigners.
  for (let pass = 0; pending.size && pass <= tables.length; pass += 1) {
    const leaves = [...pending].filter(name => !foreignKeys.some(fk => !fk.nullable && !fk.deferrable && fk.parent === name && fk.child !== name && pending.has(fk.child)))
    if (!leaves.length) throw new Error('CYCLIC_COMPANY_REFERENCES')
    for (const name of leaves) {
      await db.$executeRawUnsafe(`DELETE FROM public.${quoteIdentifier(name)} r USING runly_lifecycle.deletion_row d
        WHERE d.company_id = $1::uuid AND d.table_name = $2 AND to_jsonb(r) @> d.row_key`, companyId, name)
      pending.delete(name)
    }
  }
  // Backups have no FK/PK. Their names and original table mapping come from
  // Runly's backup ledger, not a user-provided path. Remove only this tenant.
  const backups = await db.$queryRawUnsafe(`SELECT tables FROM public.module_schema_backup`)
  for (const backup of backups) for (const entry of backup.tables ?? []) {
    const qualified = `runly_backup.${quoteIdentifier(entry.backupTable)}`
    const [exists] = await db.$queryRawUnsafe('SELECT to_regclass($1)::text AS name', qualified)
    if (!exists.name) continue
    await db.$executeRawUnsafe(`DELETE FROM ${qualified} r WHERE to_jsonb(r)->>'company_id' = $1::text
      OR EXISTS (SELECT 1 FROM runly_lifecycle.deletion_row d WHERE d.company_id = $1::uuid
      AND d.table_name = $2 AND to_jsonb(r) @> d.row_key)`, companyId, entry.table)
  }
  // Legacy singleton and namespaced configuration do not have foreign keys.
  await db.$executeRawUnsafe(`DELETE FROM public.instance_config WHERE
    (key IN ('company_id','primary_company_id') AND value = $1::text)
    OR key LIKE '%.' || $1::text OR key LIKE '%.' || $1::text || '.%'`, companyId)
  for (const table of tables.filter(t => t.columns.includes('company_id'))) {
    const [remaining] = await db.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM public.${quoteIdentifier(table.name)} WHERE company_id = $1::uuid) AS found`, companyId)
    if (remaining.found) throw new Error('COMPANY_DATA_REMAINS')
  }
  for (const table of tables) {
    const [remaining] = await db.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM public.${quoteIdentifier(table.name)} r JOIN runly_lifecycle.deletion_row d
      ON d.company_id=$1::uuid AND d.table_name=$2 AND to_jsonb(r) @> d.row_key) AS found`, companyId, table.name)
    if (remaining.found) throw new Error('COMPANY_DATA_REMAINS')
  }
  await db.$executeRawUnsafe('DELETE FROM public.company WHERE id = $1::uuid', companyId)
}
