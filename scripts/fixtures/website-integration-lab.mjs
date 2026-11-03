import {resolve, join} from 'node:path'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {createStudioStack, command} from './studio/supabase-stack.mjs'
import {seedStudioScenario} from './studio/supabase-data.mjs'
import {buildWebsitePublicRuntime} from '../build-website-public-runtime.mjs'
import {prepareDisposableNotesStorageOwner} from './realtime-2/notes-storage-owner.mjs'

// Uses a fresh, verified Compose project. No inherited application environment,
// shared database, fixture API, or replacement authentication provider.
const directory=resolve('.artifacts/website-integration')
await mkdir(directory,{recursive:true})
const stack=await createStudioStack()
try {
  await writeFile(join(directory,'target.json'),JSON.stringify({name:stack.name,composeFile:stack.composeFile}))
  const compose=JSON.parse(await readFile(stack.composeFile,'utf8'))
  const kongConfig=compose.services['supabase-kong'].volumes.find(v=>v.target==='/home/kong/temp.yml').source
  await writeFile(kongConfig,(await readFile(kongConfig,'utf8')).replaceAll('read_timeout: 3000','read_timeout: 60000').replaceAll('write_timeout: 3000','write_timeout: 60000'))
  console.log('Starting disposable Supabase services')
  await stack.compose(['up','-d','--wait','--wait-timeout','120','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'],{log:join(directory,'startup.log')})
  await stack.verifyTarget()
  const databaseUrl=`postgresql://postgres:${stack.secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${stack.ports.db}/postgres`
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(path|pathext|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|programdata|programfiles(?:\(x86\))?|programw6432|homedrive|homepath)$/i.test(key)))
  Object.assign(env,{DATABASE_URL:databaseUrl,DIRECT_URL:databaseUrl,DOTENV_CONFIG_PATH:join(directory,'empty.env')})
  await writeFile(env.DOTENV_CONFIG_PATH,'')
  await command(process.execPath,['node_modules/prisma/build/index.js','generate'],{env,log:join(directory,'generate.log')})
  await command(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env,log:join(directory,'migrate.log')})
  await command(process.execPath,['prisma/seed.js'],{env,log:join(directory,'seed.log')})
  await prepareDisposableNotesStorageOwner(stack)
  const scenario=await seedStudioScenario(stack)
  for(const company of scenario.companies)await stack.pool.query(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'website.%' ON CONFLICT DO NOTHING`,[company.roleId])
  const readRole=(await stack.pool.query(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'website.integration.reader','Lector Website',now()) RETURNING id`,[scenario.companies[0].id])).rows[0].id
  await stack.pool.query(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key IN ('website.access','website.site.read','website.pages.read','website.theme.read')`,[readRole])
  await stack.pool.query(`UPDATE membership SET role_id=$1 WHERE user_id=$2`,[readRole,scenario.users[2].id])
  // Model an existing installation, before the new route policy was persisted.
  await stack.pool.query(`UPDATE runly_module SET enabled=true,status='INSTALLED',manifest=manifest - 'routePermissions' - 'fullscreenPaths' WHERE key='runly.website'`)
  const bucket=await scenario.admin.storage.createBucket('runly-website-releases',{public:false})
  if(bucket.error)throw bucket.error
  await buildWebsitePublicRuntime(join(directory,'runtime'))
  Object.assign(env,{RUNLY_API_TEST_MODE:'1',RUNLY_SKIP_DB_INIT:'1',NODE_ENV:'development',SUPABASE_URL:stack.urls.kong,RUNLY_SUPABASE_PUBLIC_URL:stack.urls.kong,
    SUPABASE_ANON_KEY:stack.secret.SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:stack.secret.SUPABASE_SERVICE_ROLE_KEY,SUPABASE_JWT_SECRET:stack.secret.SUPABASE_JWT_SECRET,
    RUNLY_APP_URL:stack.urls.web,RUNLY_API_URL:stack.urls.api,CORS_ORIGIN:stack.urls.web,RUNLY_PROJECT_ROOT:resolve('.'),RUNLY_MODULES_DIR:join(directory,'modules'),RUNLY_WEBSITE_RUNTIME_DIR:join(directory,'runtime'),
    RUNLY_WEBSITE_NAMESPACE_ROOT:'sites.test',RUNLY_WEBSITE_CONTENT_ROOT:'content.localhost',RUNLY_WEBSITE_PREVIEW_ROOT:'preview.localhost'})
  await writeFile(join(directory,'private.json'),JSON.stringify({env,ports:stack.ports,urls:stack.urls,users:scenario.users,companies:scenario.companies,name:stack.name},null,2))
  console.log('Disposable database seeded; private launch configuration saved')
  await stack.pool.end()
} catch(error){await stack.close();throw error}
