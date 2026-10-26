// Explicit disposable database only; never loads .env or uses DATABASE_URL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import prismaPackage from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createAuthMiddleware } from '../../services/auth-middleware.js'
import { signHs256Jwt } from '../../services/jwt-verification.js'
import { createStudioRouter } from './index.js'
import { createStudioService } from './studio-service.js'
import { appendObject, blankDocument } from '../../../../shared/studio/document.js'
import { installMinimalStudioAccess } from '../../../../../scripts/fixtures/studio/minimal-access.mjs'

const url = process.env.STUDIO_TEST_DATABASE_URL
const company = '00000000-0000-4000-8000-000000000001', owner = '00000000-0000-4000-8000-000000000002'
const otherCompany = '00000000-0000-4000-8000-000000000003', otherOwner = '00000000-0000-4000-8000-000000000004'
test('Studio service against disposable PostgreSQL: isolation, atomic revisions, assets and audit', { skip: !url }, async t => {
  const parsed = new URL(url)
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname))
  assert.equal(parsed.pathname, '/studio_verification')
  const schema = `studio_service_${Date.now()}`
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},public` })
  const prisma = new prismaPackage.PrismaClient({ adapter: new PrismaPg(pool, { schema }) })
  try {
    await pool.query(`CREATE SCHEMA ${schema}`)
    await pool.query(`CREATE TABLE company(id uuid PRIMARY KEY); CREATE TABLE user_profile(id uuid PRIMARY KEY);
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE TABLE file_asset(id uuid PRIMARY KEY, entity_id uuid, uploaded_by_id uuid, enabled boolean, mime_type text);
      CREATE TABLE audit_log(id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid, actor_id uuid, module_key text,
        entity_type text, entity_id uuid, action text NOT NULL, before jsonb, after jsonb, metadata jsonb, created_at timestamptz DEFAULT now());`)
    await pool.query(await readFile(new URL('../../../../../prisma/migrations/20261130000000_studio_design/migration.sql', import.meta.url), 'utf8'))
    await installMinimalStudioAccess(pool)
    await pool.query('INSERT INTO company VALUES ($1),($2)', [company, otherCompany])
    await pool.query('INSERT INTO user_profile VALUES ($1),($2)', [owner, otherOwner])
    const service = createStudioService({ prisma })
    const document = appendObject(blankDocument(), 'text', { text: 'Persistencia real' })
    let record
    await t.test('creates with database-generated id and reopens editable objects', async () => {
      record = await service.create(company, owner, { name: 'Prueba', document })
      assert.equal(record.revision, 1)
      assert.deepEqual((await service.get(company, owner, record.id)).document, document)
      const [listed] = await service.list(company, owner)
      assert.equal(listed.objectCount, 1)
      assert.deepEqual(listed.preview.page, document.page)
      assert.equal(listed.preview.objects[0].text, 'Persistencia real')
      assert.equal((await service.list(company, owner, { q: 'prue' })).length, 1)
      assert.equal((await service.list(company, owner, { q: '100%' })).length, 0)
    })
    await t.test('denies other companies, other owners and missing identity', async () => {
      for (const [c, a] of [[otherCompany, owner], [company, otherOwner], [null, owner]]) {
        await assert.rejects(service.get(c, a, record.id), { status: 404 })
        await assert.rejects(service.update(c, a, record.id, { name: 'Intrusión', document, revision: 1 }), { status: 404 })
      }
      assert.deepEqual(await service.list(otherCompany, owner), [])
      assert.deepEqual(await service.list(company, otherOwner), [])
    })
    await t.test('opens legacy v1 documents as v2 without rewriting stored history', async () => {
      const v1 = { ...document, schemaVersion: 1, objects: document.objects.map(({ locked, hidden, ...item }) => item) }
      const { rows: [legacy] } = await pool.query('INSERT INTO studio_design(company_id,owner_id,name,document) VALUES($1,$2,$3,$4) RETURNING id', [company, owner, 'Legacy', v1])
      const reopened = await service.get(company, owner, legacy.id)
      assert.equal(reopened.document.schemaVersion, 5)
      assert.equal(reopened.document.objects[0].locked, false)
      assert.equal((await pool.query('SELECT document FROM studio_design WHERE id=$1', [legacy.id])).rows[0].document.schemaVersion, 1)
    })
    await t.test('two concurrent saves accept exactly one revision and keep the other client intact', async () => {
      const results = await Promise.allSettled(['Cliente A', 'Cliente B'].map(name => service.update(company, owner, record.id, { name, document, revision: 1 })))
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
      assert.equal(results.find(r => r.status === 'rejected').reason.code, 'STUDIO_REVISION_CONFLICT')
      assert.equal((await service.get(company, owner, record.id)).revision, 2)
      const { rows } = await pool.query('SELECT * FROM audit_log')
      assert.equal(rows.length, 2)
    })
    await t.test('foreign, disabled and unsupported image assets are rejected', async () => {
      const image = appendObject(document, 'image', { fileAssetId: otherOwner })
      await assert.rejects(service.create(company, owner, { name: 'Imagen', document: image }), { code: 'STUDIO_ASSET_DENIED' })
      await pool.query('INSERT INTO file_asset VALUES ($1,$2,$3,true,$4)', [otherOwner, otherCompany, owner, 'image/png'])
      await assert.rejects(service.create(company, owner, { name: 'Imagen', document: image }), { code: 'STUDIO_ASSET_DENIED' })
      await pool.query('UPDATE file_asset SET entity_id = $1, mime_type = $2', [company, 'image/svg+xml'])
      await assert.rejects(service.create(company, owner, { name: 'Imagen', document: image }), { code: 'STUDIO_ASSET_DENIED' })
      await pool.query('UPDATE file_asset SET mime_type = $1', ['image/png'])
      await pool.query('UPDATE file_asset SET enabled = false')
      await assert.rejects(service.create(company, owner, { name: 'Imagen', document: image }), { code: 'STUDIO_ASSET_DENIED' })
      await pool.query('UPDATE file_asset SET enabled = true, uploaded_by_id = $1', [otherOwner])
      await assert.rejects(service.create(company, owner, { name: 'Imagen', document: image }), { code: 'STUDIO_ASSET_DENIED' })
      await pool.query('UPDATE file_asset SET uploaded_by_id = $1', [owner])
      const saved = await service.create(company, owner, { name: 'Imagen', document: image })
      assert.equal(saved.document.objects.at(-1).fileAssetId, otherOwner)
    })
    await t.test('HTTP routes with real JWT verification reject missing, invalid and expired identity and denied grants', async () => {
      const secret = 'studio-disposable-jwt-secret'
      const app = new Hono()
      app.use('*', createAuthMiddleware({
        getJwtSecret: () => secret, cacheGet: () => null, cacheSet: () => {}, warn: () => {},
        supabaseAdmin: { auth: { getUser: async () => ({ data: { user: null }, error: { status: 401 } }) } },
        authorizeIdentity: async (c, id) => {
          c.set('companyId', company); c.set('userContext', { profile: { id } })
        },
      }))
      // Grants are fixture data; token verification, router, service and Prisma are real.
      app.route('/', createStudioRouter({ service, requirePermission: () => async (c, next) =>
        c.get('authUserId') === owner ? next() : c.json({ error: 'Sin permiso' }, 403) }))
      const request = token => app.request('/studio/designs', token ? { headers: { Authorization: `Bearer ${token}` } } : {})
      assert.equal((await request()).status, 401)
      assert.equal((await request('invalid')).status, 401)
      assert.equal((await request(signHs256Jwt({ sub: owner }, secret, -60))).status, 401)
      assert.equal((await request(signHs256Jwt({ sub: owner }, 'wrong-secret', 60))).status, 401)
      assert.equal((await request(signHs256Jwt({ sub: otherOwner }, secret, 60))).status, 403)
      const response = await request(signHs256Jwt({ sub: owner }, secret, 60))
      assert.equal(response.status, 200)
      assert.ok((await response.json()).data.some(item => item.id === record.id))
    })
    await t.test('audit failure rolls back the mutation', async () => {
      await pool.query("ALTER TABLE audit_log ADD CONSTRAINT reject_updates CHECK(action <> 'studio.design.update') NOT VALID")
      await assert.rejects(service.update(company, owner, record.id, { name: 'No debe persistir', document, revision: 2 }))
      const persisted = await service.get(company, owner, record.id)
      assert.equal(persisted.revision, 2)
      assert.notEqual(persisted.name, 'No debe persistir')
    })
    await t.test('Data API roles cannot read the table', async () => {
      const { rows } = await pool.query("SELECT relrowsecurity AS rls FROM pg_class WHERE oid = 'studio_design'::regclass")
      assert.equal(rows[0].rls, true)
      for (const role of ['anon', 'authenticated']) {
        const result = await pool.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [role, 'studio_design', 'SELECT'])
        assert.equal(result.rows[0].allowed, false)
      }
    })
  } finally { await prisma.$disconnect(); await pool.end() }
})
