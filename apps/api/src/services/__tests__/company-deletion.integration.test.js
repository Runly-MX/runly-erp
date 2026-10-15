// Destructive suite ONLY for an explicitly named disposable database. Never
// falls back to DATABASE_URL, DIRECT_URL or an application's configured target.
import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import pg from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createCompanyDeletionService } from '../company-deletion-service.js'
import { createCompanyDeletionResources } from '../company-deletion-resources.js'
import { createModuleBackupService } from '../module-backup-service.js'
import { Hono } from 'hono'
import { createCompanyAccessPolicy } from '../company-access-policy.js'
import { createPublicCompanyFence } from '../company-public-fence.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const url = process.env.RUNLY_LIFECYCLE_TEST_DATABASE_URL
if (url && new URL(url).pathname !== '/runly_lifecycle_test') throw new Error('Lifecycle tests require a disposable runly_lifecycle_test database')

describe('company deletion on isolated PostgreSQL', { skip: !url }, () => {
  let pool, prisma, service, a, b, admin, member, sharedRole, file, moduleRoot
  let failStorage = false
  let successfulBatches=0, failAfterBatches=Infinity
  const removed = []
  const storage = { storage: { from: bucket => ({
    remove: async keys => { if (failStorage || successfulBatches>=failAfterBatches) return { error: new Error('simulated') }; successfulBatches++; removed.push(...keys.map(key => `${bucket}/${key}`)); return { error: null } },
    list: async () => ({ data: [], error: null }),
  }) } }
  before(async () => {
    pool = new pg.Pool({ connectionString: url })
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS runly_lifecycle CASCADE; DROP SCHEMA IF EXISTS runly_backup CASCADE; CREATE SCHEMA public; CREATE FUNCTION public.uuidv7() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$')
    const require = createRequire(import.meta.url)
    const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { cwd: new URL('../../../../..', import.meta.url), encoding: 'utf8', maxBuffer: 4e6 })
    await pool.query(ddl)
    // Raw-SQL managed chat plus a cyclic nullable reference, as in real chat.
    await pool.query(`CREATE TABLE chat_conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, last_message_id uuid);
      CREATE TABLE chat_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES chat_conversations(id), body text);
      ALTER TABLE chat_conversations ADD FOREIGN KEY(last_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
      CREATE TABLE chat_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid, message_id uuid REFERENCES chat_messages(id), bucket text, object_key text);
      CREATE TABLE custom_lifecycle_item(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, enabled boolean DEFAULT true);
      CREATE TABLE custom_lifecycle_child(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES custom_lifecycle_item(id) ON DELETE RESTRICT);
      CREATE TABLE custom_lifecycle_other(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, item_id uuid REFERENCES custom_lifecycle_item(id));`)
    await pool.query(readFileSync(new URL('../../../../../prisma/migrations/20261014180000_company_deletion/migration.sql', import.meta.url), 'utf8'))
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
    a = await prisma.company.create({ data: { name: 'Empresa A', slug: 'company-a' } })
    b = await prisma.company.create({ data: { name: 'Empresa B', slug: 'company-b' } })
    admin = await prisma.userProfile.create({ data: { authUserId: '00000000-0000-4000-8000-000000000011', email: 'admin@example.test', displayName: 'Administrador' } })
    member = await prisma.userProfile.create({ data: { authUserId: '00000000-0000-4000-8000-000000000012', email: 'member@example.test', displayName: 'Miembro' } })
    sharedRole = await prisma.role.create({ data: { key: 'runly.admin', name: 'Administrador', system: true } })
    for (const company of [a,b]) await prisma.membership.create({ data: { companyId: company.id, userId: admin.id, roleId: sharedRole.id } })
    await prisma.membership.create({ data: { companyId: a.id, userId: member.id } })
    file = await prisma.fileAsset.create({ data: { entityId: a.id, bucket: 'test-files', objectKey: 'a/office.docx', originalName: 'office.docx', mimeType: 'application/test', sizeBytes: 1, contentRevision: 2 } })
    await prisma.fileAssetVersion.create({ data: { fileId: file.id, revision: 1, bucket: 'test-files', objectKey: 'a/v1.docx', originalName: 'office.docx', mimeType: 'application/test', sizeBytes: 1 } })
    await prisma.fileAsset.create({ data: { entityId: b.id, bucket: 'test-files', objectKey: 'b/keep.txt', originalName: 'keep.txt', mimeType: 'text/plain', sizeBytes: 1 } })
    await pool.query('INSERT INTO custom_lifecycle_item(company_id,enabled) VALUES($1,false),($2,true)', [a.id,b.id])
    await pool.query('INSERT INTO custom_lifecycle_child(item_id) SELECT id FROM custom_lifecycle_item WHERE company_id=$1', [a.id])
    await pool.query(`WITH c AS (INSERT INTO chat_conversations(company_id) VALUES($1) RETURNING id)
      INSERT INTO chat_messages(conversation_id,body) SELECT id,'message' FROM c`, [a.id])
    await pool.query('UPDATE chat_conversations c SET last_message_id=m.id FROM chat_messages m WHERE m.conversation_id=c.id')
    await pool.query("INSERT INTO chat_attachments(conversation_id,bucket,object_key) SELECT id,'test-files','a/abandoned' FROM chat_conversations")
    await pool.query('CREATE SCHEMA runly_backup; CREATE TABLE runly_backup.custom_snapshot AS TABLE custom_lifecycle_item')
    await pool.query('CREATE TABLE custom_exclusive_data(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payload text); INSERT INTO custom_exclusive_data(payload) VALUES(\'exclusive\')')
    for (const key of ['custom.exclusive','custom.shared']) {
      const mod = await prisma.runlyModule.create({data:{key,name:key,version:'1.0.0',manifest:{}}})
      await prisma.companyModule.create({data:{companyId:a.id,moduleId:mod.id}})
      if (key==='custom.shared') await prisma.companyModule.create({data:{companyId:b.id,moduleId:mod.id}})
      else await prisma.runlyModel.create({data:{moduleKey:key,name:'exclusive_data',tableName:'custom_exclusive_data',label:'Datos',companyScoped:false,schema:{tableName:'custom_exclusive_data',companyScoped:false}}})
    }
    await prisma.moduleSchemaBackup.create({ data: { moduleKey: 'custom.shared', tables: [{ table: 'custom_lifecycle_item', backupTable: 'custom_snapshot' }], expiresAt: new Date('2099-01-01') } })
    moduleRoot = await mkdtemp(path.join(tmpdir(),'runly-lifecycle-test-'))
    service = createCompanyDeletionService({ prisma, supabaseAdmin: storage, resources: createCompanyDeletionResources({ supabaseAdmin: storage, modulesDir:async()=>moduleRoot, bundlesDir:moduleRoot }) })
  })
  after(async () => { await prisma?.$disconnect(); await pool?.end(); if(moduleRoot) await rm(moduleRoot,{recursive:true,force:true}) })
  it('only the target administrator can request deletion and exact name is required', async () => {
    await assert.rejects(service.request({ companyId: a.id, authUserId: member.authUserId, confirmation: a.name }), { status: 403 })
    await assert.rejects(service.request({ companyId: a.id, authUserId: admin.authUserId, confirmation: 'wrong' }), { status: 422 })
  })
  it('suspends without destroying, freezes writes, blocks public capabilities, preserves other-company access', async () => {
    const result = await service.request({ companyId: a.id, authUserId: admin.authUserId, confirmation: a.name })
    assert.equal(result.pending.canRestore, true)
    assert.equal(new Date(result.pending.purgeAfter) - new Date(result.pending.requestedAt), 72*3600000)
    assert.equal((await prisma.company.findUnique({ where: { id:a.id } })).enabled, false)
    assert.equal(await prisma.fileAsset.count({ where: { entityId:a.id } }), 1)
    await assert.rejects(pool.query('DELETE FROM custom_lifecycle_item WHERE company_id=$1', [a.id]), /COMPANY_PENDING_DELETION/)
    await assert.rejects(pool.query("INSERT INTO chat_attachments(conversation_id,bucket,object_key) SELECT id,'test','new' FROM chat_conversations WHERE company_id=$1", [a.id]), /COMPANY_PENDING_DELETION/)
    const app = new Hono(); app.use('*', createPublicCompanyFence({ prisma })); app.get('/public/files/:token', c => c.json({ok:true}))
    assert.equal((await app.request(`/public/files/${file.id}`)).status, 410)
    const policy = createCompanyAccessPolicy({ prisma })
    const access = new Hono(); access.get('/business', async c => await policy(c, member.authUserId) ?? c.json({ok:true}))
    access.get('/other', async c => await policy(c, admin.authUserId) ?? c.json({ok:true}))
    assert.equal((await access.request('/business')).status,403)
    assert.equal((await access.request('/other', {headers:{'X-Runly-Company-Id':b.id}})).status,200)
    assert.deepEqual(await service.tick(), [])
  })
  it('is idempotent and cancellation restores memberships and access', async () => {
    const first = (await service.list(admin.authUserId))[0]
    await service.request({companyId:a.id,authUserId:admin.authUserId,confirmation:a.name})
    assert.equal(String((await service.list(admin.authUserId))[0].purgeAfter),String(first.purgeAfter))
    await service.cancel({companyId:a.id,authUserId:admin.authUserId})
    assert.equal((await prisma.company.findUnique({where:{id:a.id}})).enabled,true)
    assert.equal(await prisma.membership.count({where:{companyId:a.id,enabled:true}}),2)
  })
  it('deadline is enforced; Storage failure keeps metadata and retries safely', async () => {
    await service.request({companyId:a.id,authUserId:admin.authUserId,confirmation:a.name})
    await pool.query("UPDATE runly_lifecycle.company_deletion SET purge_after=now()-interval '1 second' WHERE company_id=$1",[a.id])
    await assert.rejects(service.cancel({companyId:a.id,authUserId:admin.authUserId}),{status:409})
    failStorage = true
    const result = await service.tick()
    assert.equal(result[0].ok,false)
    assert.equal(result[0].code,'STORAGE_DELETE_FAILED')
    assert.equal(await prisma.fileAsset.count({where:{entityId:a.id}}),1)
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM runly_lifecycle.deletion_object WHERE company_id=$1',[a.id])
    assert.equal(rows[0].n,3)
  })
  it('purges inactive custom rows, children, chat, file versions and backups while preserving shared accounts and B', async () => {
    failStorage = false
    await pool.query("UPDATE runly_lifecycle.company_deletion SET updated_at=now()-interval '6 minutes' WHERE company_id=$1",[a.id])
    const result = await service.tick()
    assert.deepEqual(result,[{companyId:a.id,ok:true}])
    assert.equal(await prisma.company.count({where:{id:a.id}}),0)
    assert.equal(await prisma.company.count({where:{id:b.id,enabled:true}}),1)
    assert.equal(await prisma.userProfile.count(),2)
    assert.equal(await prisma.membership.count({where:{companyId:b.id}}),1)
    assert.equal(await prisma.fileAsset.count(),1)
    assert.equal(await prisma.fileAssetVersion.count(),0)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM chat_attachments')).rows[0].n,0)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM custom_lifecycle_child')).rows[0].n,0)
    assert.equal((await pool.query('SELECT company_id FROM runly_backup.custom_snapshot')).rows[0].company_id,b.id)
    assert.deepEqual(new Set(removed),new Set(['test-files/a/office.docx','test-files/a/v1.docx','test-files/a/abandoned','module-bundles/custom.exclusive.js']))
    assert.equal(await prisma.runlyModule.count({where:{key:'custom.shared'}}),1)
    assert.equal(await prisma.runlyModule.count({where:{key:'custom.exclusive'}}),0)
    assert.equal((await pool.query("SELECT to_regclass('public.custom_exclusive_data')::text AS name")).rows[0].name,null)
    assert.equal((await pool.query('SELECT state FROM runly_lifecycle.company_deletion WHERE company_id=$1',[a.id])).rows[0].state,'COMPLETED')
    await assert.rejects(pool.query('INSERT INTO custom_lifecycle_item(company_id) VALUES($1)',[a.id]),/COMPANY_PENDING_DELETION/)
    assert.deepEqual(await service.tick(),[])
  })
  it('blocks restoration of backups from before deletion', async () => {
    const backup = await prisma.moduleSchemaBackup.findFirst()
    const backups = createModuleBackupService({prisma})
    await assert.rejects(backups.restoreBackup({moduleKey:backup.moduleKey,backupId:backup.id}),/COMPANY_LIFECYCLE_BACKUP_BLOCKED/)
  })
  it('refuses a cross-company reference without deleting the other company or its resource', async () => {
    const company = await prisma.company.create({data:{name:'Empresa C',slug:'company-c'}})
    await prisma.membership.create({data:{companyId:company.id,userId:admin.id,roleId:sharedRole.id}})
    const parent = (await pool.query('INSERT INTO custom_lifecycle_item(company_id) VALUES($1) RETURNING id',[company.id])).rows[0]
    await pool.query('INSERT INTO custom_lifecycle_other(company_id,item_id) VALUES($1,$2)',[b.id,parent.id])
    await service.request({companyId:company.id,authUserId:admin.authUserId,confirmation:company.name})
    await pool.query("UPDATE runly_lifecycle.company_deletion SET purge_after=now()-interval '1 second' WHERE company_id=$1",[company.id])
    const before = removed.length
    assert.equal((await service.tick())[0].code,'CROSS_COMPANY_REFERENCE')
    assert.equal(removed.length,before)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM custom_lifecycle_other WHERE company_id=$1',[b.id])).rows[0].n,1)
  })
  it('two workers claim a due company safely and the last-company administrator retains the recovery route', async () => {
    const company=await prisma.company.create({data:{name:'Empresa D',slug:'company-d'}})
    await prisma.membership.create({data:{companyId:company.id,userId:admin.id,roleId:sharedRole.id}})
    await service.request({companyId:company.id,authUserId:admin.authUserId,confirmation:company.name})
    await pool.query("UPDATE runly_lifecycle.company_deletion SET purge_after=now()-interval '1 second' WHERE company_id=$1",[company.id])
    await Promise.all([service.tick(),service.tick()])
    assert.equal((await pool.query('SELECT state FROM runly_lifecycle.company_deletion WHERE company_id=$1',[company.id])).rows[0].state,'COMPLETED')
    assert.equal(await prisma.company.count({where:{id:company.id}}),0)
    assert.equal(await prisma.company.count({where:{id:b.id,enabled:true}}),1)
  })
  it('commits verified Storage batches so a later failure resumes instead of starting over', async () => {
    const company=await prisma.company.create({data:{name:'Empresa E',slug:'company-e'}})
    await prisma.membership.create({data:{companyId:company.id,userId:admin.id,roleId:sharedRole.id}})
    await prisma.fileAsset.createMany({data:Array.from({length:101},(_,index)=>({entityId:company.id,bucket:'batch-files',objectKey:`e/file-${index}.txt`,originalName:'file.txt',mimeType:'text/plain',sizeBytes:1}))})
    await service.request({companyId:company.id,authUserId:admin.authUserId,confirmation:company.name})
    await pool.query("UPDATE runly_lifecycle.company_deletion SET purge_after=now()-interval '1 second' WHERE company_id=$1",[company.id])
    failAfterBatches=successfulBatches+1
    assert.equal((await service.tick())[0].code,'STORAGE_DELETE_FAILED')
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM runly_lifecycle.deletion_object WHERE company_id=$1 AND removed',[company.id])).rows[0].n,100)
    assert.equal(await prisma.fileAsset.count({where:{entityId:company.id}}),101)
    failAfterBatches=Infinity
    await pool.query("UPDATE runly_lifecycle.company_deletion SET updated_at=now()-interval '6 minutes' WHERE company_id=$1",[company.id])
    assert.equal((await service.tick())[0].ok,true)
    assert.equal(await prisma.fileAsset.count({where:{entityId:company.id}}),0)
  })
})
