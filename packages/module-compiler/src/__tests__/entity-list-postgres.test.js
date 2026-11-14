import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { compileModule } from '../index.js'

// Explicit disposable PostgreSQL only; never reads the ERP's database config.
const url = process.env.RUNLY_LIST_TEST_DATABASE_URL
test('generated list HTTP routes filter, sort, paginate and bind hostile input in PostgreSQL', { skip: !url }, async () => {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
  const db = new pg.Client({ connectionString: url })
  const dir = await mkdtemp(join(process.cwd(), '.tmp-entity-list-'))
  const company = '0192f000-0000-7000-8000-000000000001'
  try {
    await db.connect()
    await db.query('BEGIN')
    await db.query('CREATE EXTENSION IF NOT EXISTS unaccent')
    await db.query('CREATE OR REPLACE FUNCTION public.atlas_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT public.unaccent($1) $$')
    await db.query(`CREATE TEMP TABLE listcheck_producto (id text, company_id uuid, enabled boolean, nombre text, precio numeric, estado text, fecha date, created_at timestamptz, updated_at timestamptz)`)
    await db.query(`INSERT INTO listcheck_producto VALUES
      ('a', $1, true, 'Alfa', 10, 'abierto', '2026-11-10', '2026-11-01', '2026-11-01'),
      ('b', $1, true, 'Beta', 2, 'cerrado', '2026-11-02', '2026-11-02', '2026-11-02'),
      ('c', $1, true, 'Gamma', NULL, 'abierto', NULL, '2026-11-03', '2026-11-03'),
      ('disabled', $1, false, 'Oculto', 0, 'abierto', NULL, NOW(), NOW()),
      ('other', '0192f000-0000-7000-8000-000000000002', true, 'Otra empresa', 0, 'abierto', NULL, NOW(), NOW())`, [company])
    const definition = {
      schemaVersion: 1, key: 'custom.listcheck', name: 'Listados', version: '1.0.0', icon: 'Package', color: '#2563EB', pwa: { shortName: 'Listados', startPath: '/productos' },
      entities: [{ key: 'producto', label: 'Producto', fields: [{ key: 'nombre', type: 'text' }, { key: 'precio', type: 'decimal' }, { key: 'estado', type: 'select', options: ['abierto', 'cerrado'] }, { key: 'fecha', type: 'date' }], list: { defaultSort: { field: 'precio', direction: 'desc' } } }],
    }
    for (const file of compileModule(definition).files.filter(file => /^(api|validators)\//.test(file.path))) {
      const path = join(dir, file.path)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, file.content)
    }
    const prisma = { $queryRaw: async (strings, ...values) => {
      const sql = strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '')
      return (await db.query(sql, values)).rows
    } }
    const { createProductoRouter } = await import(pathToFileURL(join(dir, 'api/producto-routes.js')))
    const app = createProductoRouter({ prisma, requirePermission: () => async (c, next) => { c.set('companyId', company); await next() } })
    const list = async (query = '') => {
      const response = await app.request(`/listcheck/productos?${query}`)
      assert.equal(response.status, 200)
      return response.json()
    }
    const ids = async query => (await list(query)).data.map(row => row.id)
    assert.deepEqual(await ids(''), ['a', 'b', 'c'])
    assert.deepEqual(await ids('sortBy=precio&sortDir=asc'), ['b', 'a', 'c'])
    assert.deepEqual(await ids('sortBy=fecha&sortDir=asc'), ['b', 'a', 'c'])
    assert.deepEqual(await ids('sortBy=nombre&sortDir=desc'), ['c', 'b', 'a'])
    assert.deepEqual(await ids('estado=abierto&sortBy=precio&sortDir=asc'), ['a', 'c'])
    assert.deepEqual(await ids('search=Beta'), ['b'])
    const page = await list('sortBy=precio&sortDir=asc&pageSize=1&page=2')
    assert.deepEqual(page.data.map(row => row.id), ['a'])
    assert.equal(page.pagination.total, 3)
    assert.deepEqual(await ids('sortBy=precio%3BDROP%20TABLE%20listcheck_producto&sortDir=desc'), ['a', 'b', 'c'])
    assert.deepEqual(await ids('sortBy=precio&sortDir=malicious'), ['a', 'b', 'c'])
    assert.equal((await list('estado=abierto%27%20OR%201%3D1--')).pagination.total, 0)
  } finally {
    await db.query('ROLLBACK').catch(() => {})
    await db.end()
    await rm(dir, { recursive: true, force: true })
  }
})
