// Upgrade regression against an identity-checked, disposable self-hosted DB.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createStudioStack, command } from './fixtures/studio/supabase-stack.mjs'

const stack=await createStudioStack({apiImage:'runly-studio-v7:ad3977d5-api'})
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(path|pathext|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|programdata|programfiles(?:\(x86\))?|programw6432|homedrive|homepath|home)$/i.test(key)))
const migration='20261210000000_studio_realtime_ephemeral',image='runly-studio-realtime:df739fe4-api'
const checks=[]
const record=value=>{checks.push(value);console.log(value)}
try{
  const config=JSON.parse(await readFile(stack.composeFile,'utf8'))
  config.services['supabase-db'].volumes=config.services['supabase-db'].volumes.filter(v=>!v.target.includes('studio-realtime-role'))
  await writeFile(stack.composeFile,JSON.stringify(config,null,2))
  await stack.compose(['up','-d','--wait','--wait-timeout','120','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'],{log:join(stack.directory,'startup.log')})
  await stack.verifyTarget();await stack.initialize()
  const original=(await stack.pool.query('SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows
  await stack.pool.query("CREATE TABLE studio_upgrade_probe(id integer PRIMARY KEY,value text); INSERT INTO studio_upgrade_probe VALUES(1,'preserve')")
  config.services['runly-api'].image=image
  await writeFile(stack.composeFile,JSON.stringify(config,null,2))
  const probe=await stack.pool.connect()
  try{
    await assert.rejects(probe.query(await readFile(`prisma/migrations/${migration}/migration.sql`,'utf8')),error=>/STUDIO_SOCKET_SCHEMA_OWNER_REQUIRED|permission denied to create role/.test(error.message))
  }finally{await probe.query('ROLLBACK');probe.release()}
  const migrate=log=>stack.compose(['run','--rm','--no-deps','--entrypoint','pnpm','runly-api','exec','prisma','migrate','deploy'],{log:join(stack.directory,log)})
  await assert.rejects(migrate('first-failure.log'))
  const [failed]=(await stack.pool.query('SELECT logs FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NULL AND rolled_back_at IS NULL',[migration])).rows
  assert.match(await readFile(join(stack.directory,'first-failure.log'),'utf8'),/current transaction is aborted|STUDIO_SOCKET_SCHEMA_OWNER_REQUIRED/)
  await assert.rejects(migrate('blocked.log'));assert.match(await readFile(join(stack.directory,'blocked.log'),'utf8'),/P3009/)
  record('Existing DB without new init SQL reproduces schema-owner failure followed by P3009')

  const directory=join(stack.directory,'installer')
  for(const file of ['recover-studio-realtime.mjs','lib/studio-realtime-db.mjs','lib/instance-identity.mjs','supabase/volumes/db/studio-realtime-role.sql']){
    const target=join(directory,file);await mkdir(resolve(target,'..'),{recursive:true});await copyFile(join('infra/installer',file),target)
  }
  await writeFile(join(directory,'docker-compose.yml'),JSON.stringify(config,null,2))
  await writeFile(join(directory,'supabase/docker-compose.supabase.yml'),'services: {}\n')
  const values=new Map((await readFile(join(stack.directory,'test.env'),'utf8')).split('\n').filter(Boolean).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]))
  values.set('RUNLY_SUPABASE_MODE','selfhosted');values.set('DATABASE_URL',config.services['runly-api'].environment.DATABASE_URL);values.set('DIRECT_URL',config.services['runly-api'].environment.DIRECT_URL)
  await writeFile(join(directory,'.env.local'),[...values].map(([k,v])=>`${k}=${v}`).join('\n'))
  await writeFile(join(directory,'.env'),[...values].map(([k,v])=>`${k}=${v}`).join('\n'))
  const recover=(args=[],log='recovery.log')=>command(process.execPath,[join(directory,'recover-studio-realtime.mjs'),...args],{env:cleanEnv,log:join(stack.directory,log)})
  const diagnosis=await recover([],'diagnosis.log');assert.match(diagnosis,/'Solo diagnóstico'|Solo diagnóstico/)
  assert.equal((await stack.pool.query("SELECT to_regrole('runly_studio_socket') IS NULL absent")).rows[0].absent,true)
  await stack.pool.query("UPDATE _prisma_migrations SET logs='Unknown failure' WHERE migration_name=$1 AND rolled_back_at IS NULL",[migration])
  await assert.rejects(recover(['--recover-known-failure',`--api-image=${image}`],'unknown-failure.log'))
  assert.equal((await stack.pool.query('SELECT count(*)::int n FROM _prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NOT NULL',[migration])).rows[0].n,0)
  await stack.pool.query('UPDATE _prisma_migrations SET logs=$1 WHERE migration_name=$2 AND rolled_back_at IS NULL',[failed.logs,migration])
  record('Diagnosis is read-only; an unrelated failure is refused without changing migration history')
  await recover(['--recover-known-failure',`--api-image=${image}`])
  await migrate('reapply.log');await migrate('idempotent.log')
  assert.equal((await stack.pool.query('SELECT value FROM studio_upgrade_probe WHERE id=1')).rows[0].value,'preserve')
  const history=(await stack.pool.query('SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows
  for(const row of original)assert.ok(history.some(v=>v.migration_name===row.migration_name&&v.checksum===row.checksum))
  assert.equal((await stack.pool.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='realtime' AND policyname IN ('studio_socket_read','studio_socket_write')")).rows[0].n,2)
  assert.equal((await stack.pool.query("SELECT with_check FROM pg_policies WHERE policyname='runly_realtime_server_writes'")).rows[0].with_check,'false')
  assert.equal((await stack.pool.query('SELECT count(*)::int n FROM _prisma_migrations WHERE migration_name=$1',[migration])).rows[0].n,2)
  record('Owner preparation + Prisma rolled-back + reapply succeeds twice; data, old checksums and global restrictions preserved')
  await writeFile(join(stack.directory,'upgrade-result.json'),JSON.stringify({passed:true,checks},null,2))
}finally{await stack.close()}
