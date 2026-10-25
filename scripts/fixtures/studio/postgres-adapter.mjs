export function database(client, pool) {
  const query = async (sql, values) => (await client.query(sql, values)).rows
  return {
    $queryRaw: (strings, ...values) => query(strings.reduce((sql, part, n) => sql + (n ? `$${n}` : '') + part, ''), values),
    $transaction: async callback => {
      const connection = await pool.connect()
      try {
        await connection.query('BEGIN')
        const result = await callback(database(connection, pool))
        await connection.query('COMMIT'); return result
      } catch (error) { await connection.query('ROLLBACK'); throw error } finally { connection.release() }
    },
    fileAsset: { findMany: ({ where }) => query('SELECT id FROM file_asset WHERE id = ANY($1::uuid[]) AND entity_id = $2 AND uploaded_by_id = $3 AND enabled = true AND mime_type = ANY($4::text[])',
      [where.id.in, where.entityId, where.uploadedById, where.mimeType.in]) },
    auditLog: { create: ({ data }) => query('INSERT INTO audit_log(action, entity_id, metadata) VALUES ($1,$2,$3) RETURNING *', [data.action, data.entityId, data.metadata]) },
  }
}

