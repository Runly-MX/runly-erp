import assert from 'node:assert/strict'
import pg from 'pg'
import { readFile } from 'node:fs/promises'

export async function prepareDisposableNotesStorageOwner(stack) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,stack.name)
  const configuration=JSON.parse(await readFile(stack.composeFile,'utf8'))
  const connection=new URL(configuration.services['supabase-storage'].environment.DATABASE_URL)
  connection.hostname='127.0.0.1';connection.port=String(stack.ports.db)
  const owner=new pg.Pool({connectionString:connection.href})
  try {await owner.query(await readFile('prisma/prepare-notes-storage-owner.sql','utf8'))}
  finally {await owner.end()}
}
