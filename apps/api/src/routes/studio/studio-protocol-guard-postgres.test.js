// Explicit disposable database only; never loads .env or uses DATABASE_URL.
// Applies the real guard migration chain on stub tables and checks the writer matrix.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { writerProtocol } from '../../../../shared/studio/protocol.js'

const url = process.env.STUDIO_TEST_DATABASE_URL
const migration = name => readFile(new URL(`../../../../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8')

test('Studio v8 protocol guard on disposable PostgreSQL', { skip: !url }, async () => {
  const parsed = new URL(url)
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname))
  assert.equal(parsed.pathname, '/studio_verification')
  const schema = `studio_guard_${Date.now()}`
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},public` })
  try {
    await pool.query(`CREATE SCHEMA ${schema}; CREATE SCHEMA IF NOT EXISTS runly_studio;
      CREATE TABLE studio_design(id int PRIMARY KEY, name text, revision int, document jsonb);
      CREATE TABLE studio_template(id int PRIMARY KEY, name text, revision int, document jsonb);
      CREATE TABLE studio_presence(id int);`)
    for (const name of ['20261207000000_studio_protocol_guard', '20261208000000_studio_multipage_protocol']) await pool.query(await migration(name))
    const write = async (table, from, to, protocol) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(`INSERT INTO ${table} VALUES (1, 'x', 1, $1)`, [{ schemaVersion: from }])
        if (protocol) await client.query(`SELECT set_config('runly.studio.protocol', $1, true)`, [protocol])
        await client.query(`UPDATE ${table} SET document = $1, revision = 2 WHERE id = 1`, [{ schemaVersion: to }])
        return 'ok'
      } catch (error) {
        return error.message.includes('DOWNGRADE') ? 'downgrade' : error.message.includes('UPGRADE_REQUIRED') ? 'upgrade' : error.message
      } finally {
        await client.query('ROLLBACK'); client.release()
      }
    }
    // Before the v8 migration (an installation not yet migrated): the API's declared
    // protocol keeps v1–v7 writes working and v8 writes fail closed.
    for (const table of ['studio_design', 'studio_template']) {
      for (const [from, to, expected] of [[7, 7, 'ok'], [6, 7, 'ok'], [6, 6, 'ok'], [7, 8, 'upgrade'], [8, 8, 'upgrade']])
        assert.equal(await write(table, from, to, writerProtocol(from, to)), expected, `pre-v8 trigger ${table} v${from}→v${to}`)
    }
    await pool.query(await migration('20270107000000_studio_v8_protocol'))
    for (const table of ['studio_design', 'studio_template']) {
      for (const [from, to] of [[6, 6], [6, 7], [7, 7], [7, 8], [8, 8]]) assert.equal(await write(table, from, to, writerProtocol(from, to)), 'ok', `API writer ${table} v${from}→v${to}`)
      const cases = [
        [7, 7, '3', 'ok'], [7, 7, '4', 'ok'], [7, 7, '2', 'upgrade'], [7, 7, null, 'upgrade'],
        [7, 8, '3', 'upgrade'], [7, 8, '4', 'ok'], [8, 8, '3', 'upgrade'], [8, 8, '4', 'ok'],
        [8, 7, '4', 'downgrade'], [8, 7, '3', 'upgrade'], [6, 6, '2', 'ok'], [6, 6, '4', 'ok'], [6, 7, '2', 'upgrade'], [5, 5, null, 'ok'],
      ]
      for (const [from, to, protocol, expected] of cases) assert.equal(await write(table, from, to, protocol), expected, `${table} v${from}→v${to} protocol ${protocol}`)
    }
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {})
    await pool.end()
  }
})
