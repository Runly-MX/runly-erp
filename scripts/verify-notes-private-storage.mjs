import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createStudioStack, command } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { signHs256Jwt } from '../apps/api/src/services/jwt-verification.js'
import { verifyNotesImagesUi } from './fixtures/realtime-2/notes-images-ui.mjs'
import { createNotesService } from '../apps/api/src/routes/notes/notes-service.js'
import { ensureNotesStoragePolicy, ensureNotesBucketGuard } from '../apps/api/src/routes/notes/image-storage.js'
import { createNoteImageService } from '../apps/api/src/routes/notes/image-service.js'
import { prepareDisposableNotesStorageOwner } from './fixtures/realtime-2/notes-storage-owner.mjs'
const require=createRequire(new URL('../apps/api/package.json',import.meta.url))
const {createClient}=require('@supabase/supabase-js')
const Y=await import(pathToFileURL(require.resolve('yjs').replace(/yjs\.cjs$/,'yjs.mjs')).href)
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg')
const sharp=require('sharp')
const image=process.argv.find(a=>a.startsWith('--api-image='))?.slice(12)
assert.match(image??'',/^runly-notes-private:(?:full-)?api-[a-f0-9]+$/)
const upgrade=process.argv.includes('--upgrade'),checks=[]
const stack=await createStudioStack({apiImage:upgrade?'runly-realtime2:full-api-fa6f6d2a2877':image})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const png=await sharp({create:{width:64,height:32,channels:4,background:'#7c3aed'}}).png().toBuffer()
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
try {
  await stack.compose(['up','-d','--wait','--wait-timeout','120','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'],{log:join(stack.directory,'startup.log')})
  await stack.verifyTarget();await stack.initialize()
  const data=await seedStudioScenario(stack),{users,companies,admin}=data,company=companies[0]
  await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'notes.%' OR key LIKE 'canvas.%' OR key LIKE 'chat.%' ON CONFLICT DO NOTHING",[company.roleId])
  await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'notes.%' ON CONFLICT DO NOTHING",[companies[1].roleId])
  users[3].companyId=companies[1].id
  await stack.pool.query('UPDATE membership SET role_id=$1 WHERE user_id=$2 AND company_id=$3',[company.roleId,users[1].id,company.id])
  await stack.pool.query("UPDATE runly_module SET enabled=true,status='INSTALLED' WHERE key IN ('runly.notes','runly.canvas','runly.chat')")
  for(const user of users){const c=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const {data:s,error}=await c.auth.signInWithPassword(user);assert.equal(error,null);user.session=s.session}
  const note=(await stack.pool.query("INSERT INTO notes(company_id,owner_user_id,title) VALUES($1,$2,'Historica') RETURNING *",[company.id,users[0].id])).rows[0]
  const legacyPublic=(await stack.pool.query("INSERT INTO notes(company_id,owner_user_id,title,is_public,public_slug) VALUES($1,$2,'Publicada historica',true,'legacy-public-test') RETURNING id",[company.id,users[0].id])).rows[0]
  const urls=[]
  for(const bucket of ['runly-notes','atlas-notes']) {
    await admin.storage.createBucket(bucket,{public:false})
    assert.equal((await admin.storage.updateBucket(bucket,{public:upgrade})).error,null)
    const key=`companies/${company.id}/notes/${note.id}/${bucket}.png`
    assert.equal((await admin.storage.from(bucket).upload(key,png,{contentType:'image/png'})).error,null)
    urls.push(`${stack.urls.kong}/storage/v1/object/public/${bucket}/${key}`)
    if(upgrade)assert.equal((await fetch(urls.at(-1))).status,200)
  }
  const doc=new Y.Doc(),fragment=doc.getXmlFragment('default'),paragraph=new Y.XmlElement('paragraph'),text=new Y.XmlText('Contenido historico')
  const publicKey=`companies/${company.id}/notes/${legacyPublic.id}/public-legacy.png`
  assert.equal((await admin.storage.from('runly-notes').upload(publicKey,png,{contentType:'image/png'})).error,null)
  const legacyPublicUrl=`${stack.urls.kong}/storage/v1/object/public/runly-notes/${publicKey}`
  await stack.pool.query('UPDATE notes SET content=$1::jsonb WHERE id=$2',[JSON.stringify(`<img src="${legacyPublicUrl}">`),legacyPublic.id])
  paragraph.insert(0,[text]);const imageNode=new Y.XmlElement('image');imageNode.setAttribute('src',urls[0]);fragment.insert(0,[paragraph,imageNode])
  const state=Buffer.from(Y.encodeStateAsUpdate(doc));doc.destroy()
  await stack.pool.query('UPDATE notes SET content=$1::jsonb,cover_url=$2 WHERE id=$3',[JSON.stringify(`<p>Contenido historico</p><img src="${urls[0]}">`),urls[1],note.id])
  await stack.pool.query('INSERT INTO note_ydoc_state(note_id,state,version) VALUES($1,$2,1)',[note.id,state])
  await stack.pool.query('INSERT INTO note_canvas_scene(note_id,files) VALUES($1,$2::jsonb)',[note.id,JSON.stringify({historic:{url:urls[1],mimeType:'image/png',storageKey:'retained'}})])
  const canvasNote=(await stack.pool.query("INSERT INTO notes(company_id,owner_user_id,title,note_type) VALUES($1,$2,'Lienzo historico','canvas') RETURNING id",[company.id,users[0].id])).rows[0]
  const element={id:'historic-image',type:'image',fileId:'historic',x:0,y:0,width:200,height:200,angle:0,index:'a0',scale:[1,1],status:'saved',crop:null,seed:42,version:1,versionNonce:1,isDeleted:false,frameId:null,boundElements:null,roundness:null,updated:1,link:null,locked:false,strokeColor:'#000000',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[]}
  await stack.pool.query('INSERT INTO note_canvas_scene(note_id,elements,files) VALUES($1,$2::jsonb,$3::jsonb)',[canvasNote.id,JSON.stringify([element]),JSON.stringify({historic:{url:urls[0],mimeType:'image/png',storageKey:'retained'}})])
  await stack.pool.query("INSERT INTO note_shares(note_id,shared_with_user_id,shared_by_user_id,permission) VALUES($1,$2,$3,'edit'),($1,$4,$3,'read')",[note.id,users[2].id,users[0].id,users[1].id])
  const historicalSnapshot=async()=>JSON.stringify((await stack.pool.query('SELECT n.content,n.cover_url,s.files,s.elements FROM notes n JOIN note_canvas_scene s ON s.note_id=n.id WHERE n.id=$1',[note.id])).rows[0])
  const beforeTransition=await historicalSnapshot()
  // Explicit owner preparation, separate from Prisma: the same least-privilege
  // transition required for external installations. Target stays verified/local.
  await prepareDisposableNotesStorageOwner(stack)
  if(upgrade){
    const compose=JSON.parse(await readFile(stack.composeFile,'utf8'));compose.services['runly-api'].image=image
    await writeFile(stack.composeFile,JSON.stringify(compose))
    await stack.compose(['run','--rm','--no-deps','--entrypoint','node','runly-api','node_modules/prisma/build/index.js','migrate','deploy'],{log:join(stack.directory,'upgrade-migrate.log')})
  }
  await stack.compose(['up','-d','runly-api'],{log:join(stack.directory,'api-start.log')})
  for(let i=0;i<100;i++){try{if((await fetch(stack.urls.api+'/health')).ok)break}catch{}await wait(250)}
  const request=async(path,actor=users[0],body,method=body?'POST':'GET')=>fetch(stack.urls.api+path,{method,headers:{...(actor?{Authorization:`Bearer ${actor.session.access_token}`}:{ }),'X-Runly-Company-Id':actor?.companyId??company.id,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  const media=(src,actor)=>request(`/notes/${note.id}/media?src=${encodeURIComponent(src)}`,actor)
  for(const bucket of ['runly-notes','atlas-notes'])assert.equal((await admin.storage.getBucket(bucket)).data.public,false)
  const protectedTables=(await stack.pool.query("SELECT c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') AS anon_read,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_read FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('note_image_binding','note_image_storage_state')")).rows
  assert.equal(protectedTables.length,2)
  assert.ok(protectedTables.every(row=>row.relrowsecurity&&!row.anon_read&&!row.authenticated_read))
  for(const bucket of ['runly-notes','atlas-notes'])assert.ok((await admin.storage.updateBucket(bucket,{public:true})).error,'An older startup could reopen the bucket')
  await stack.pool.query("CREATE POLICY fixture_global_object_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id IN ('runly-notes','atlas-notes'))")
  assert.equal(digest((await stack.pool.query('SELECT state FROM note_ydoc_state WHERE note_id=$1',[note.id])).rows[0].state),digest(state))
  assert.equal(await historicalSnapshot(),beforeTransition)
  checks.push('Fresh/upgrade migration closes current and legacy buckets; Y.Doc bytes preserved')
  assert.equal((await request(`/public/notes/legacy-public-test/media?src=${encodeURIComponent(legacyPublicUrl)}`,null)).status,200)
  checks.push('A pre-existing public slug keeps serving its image through the controlled route after migration')
  for(const src of urls){
    for(const user of[users[0],users[1],users[2]]){const r=await media(src,user);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal(digest(Buffer.from(await r.arrayBuffer())),digest(png))}
    for(const actor of[users[3],null])assert.notEqual((await media(src,actor)).status,200)
    for(const path of[src,src.replace('/object/public/','/render/image/public/')+'?width=24',src.replace('/object/public/','/object/authenticated/')])for(const token of[null,users[0].session.access_token]){
      const response=await fetch(path,{headers:token?{apikey:stack.secret.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`}:{}});assert.notEqual(response.status,200)
    }
  }
  checks.push('Owner/editor/reader receive exact bytes; foreign/anonymous and raw original/variant/authenticated Storage routes denied')
  for(const actor of [users[0],null]) {
    const client=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},...(actor?{accessToken:async()=>actor.session.access_token}:{})})
    const listed=await client.storage.from('runly-notes').list(`companies/${company.id}/notes/${note.id}`)
    assert.ok(listed.error||listed.data.length===0)
  }
  await stack.pool.query('UPDATE user_profile SET enabled=false WHERE id=$1',[users[1].id])
  assert.notEqual((await media(urls[0],users[1])).status,200)
  await stack.pool.query('UPDATE user_profile SET enabled=true WHERE id=$1',[users[1].id])
  const foreignCreated=await request('/notes',users[3],{title:'Otra empresa',content:'<p>Empresa B</p>'});assert.equal(foreignCreated.status,201)
  checks.push('Authorized operator in another active company still cannot read the private image; disabled profile and raw listing are denied')
  const missing=urls[0].replace('.png','-other.png');assert.notEqual((await media(missing,users[0])).status,200)
  const expired={session:{access_token:signHs256Jwt({...users[0].session.user,sub:users[0].authId,role:'authenticated',exp:1},stack.secret.SUPABASE_JWT_SECRET,-60)}}
  assert.notEqual((await media(urls[0],expired)).status,200)
  const upload=await request('/notes/presign-image',users[0],{noteId:note.id,fileName:'new.png',mimeType:'image/png'});assert.equal(upload.status,201)
  const signed=await upload.json();assert.equal((await admin.storage.from('runly-notes').uploadToSignedUrl(signed.objectKey,signed.uploadToken,png,{contentType:'image/png'})).error,null)
  assert.equal((await media(signed.publicUrl,users[0])).status,200);assert.notEqual((await fetch(signed.publicUrl)).status,200)
  assert.notEqual((await request('/notes/presign-image',users[1],{noteId:note.id,fileName:'bad.png',mimeType:'image/png'})).status,201)
  checks.push('New signed upload remains private; read-only upload denied, enumeration and expired Auth denied')
  const draftUpload=await request('/notes/presign-image',users[0],{noteId:'draft',fileName:'draft.png',mimeType:'image/png'})
  assert.equal(draftUpload.status,201)
  const draftAsset=await draftUpload.json()
  assert.equal((await admin.storage.from('runly-notes').uploadToSignedUrl(draftAsset.objectKey,draftAsset.uploadToken,png,{contentType:'image/png'})).error,null)
  const draftCreated=await request('/notes',users[0],{title:'Desde borrador',content:`<img src="${draftAsset.publicUrl}">`})
  assert.equal(draftCreated.status,201)
  const draftNote=(await draftCreated.json()).note
  await stack.pool.query("INSERT INTO note_shares(note_id,shared_with_user_id,shared_by_user_id,permission) VALUES($1,$2,$3,'read')",[draftNote.id,users[1].id,users[0].id])
  assert.equal((await request(`/notes/${draftNote.id}/media?src=${encodeURIComponent(draftAsset.publicUrl)}`,users[1])).status,200)
  checks.push('Draft upload binds atomically when the note is created; a reader can view it before the owner opens the editor')
  const published=await request(`/notes/${note.id}/publish`,users[0],{});assert.equal(published.status,200)
  const body=await published.json(),slug=(body.note??body.data??body).public_slug;assert.ok(slug)
  const publicMedia=src=>request(`/public/notes/${slug}/media?src=${encodeURIComponent(src)}`,null)
  for(const src of urls)assert.equal((await publicMedia(src)).status,200)
  assert.notEqual((await publicMedia(signed.publicUrl)).status,200,'Public reader obtained an unreferenced upload')
  assert.equal((await request(`/notes/${note.id}/unpublish`,users[0],{})).status,200)
  assert.notEqual((await publicMedia(urls[0])).status,200)
  await stack.pool.query('DELETE FROM note_shares WHERE note_id=$1 AND shared_with_user_id=$2',[note.id,users[2].id])
  assert.notEqual((await media(urls[0],users[2])).status,200)
  checks.push('Public valid referenced images load; unpublish and collaborator revocation deny subsequent reads')
  const destination=(await (await request('/notes',users[0],{title:'Destino de prueba',content:'<p>Destino</p>'})).json()).note
  await stack.pool.query("INSERT INTO note_shares(note_id,shared_with_user_id,shared_by_user_id,permission) VALUES($1,$2,$3,'edit')",[destination.id,users[2].id,users[0].id])
  await request(`/notes/${destination.id}`,users[2],{content:`<img src="${urls[0]}">`},'PATCH')
  const destinationMedia=`/notes/${destination.id}/media?src=${encodeURIComponent(urls[0])}`
  assert.notEqual((await request(destinationMedia,users[0])).status,200,'Owner read implicitly granted a collaborator access to another private note')
  assert.equal((await request(`/notes/${destination.id}/publish`,users[0],{})).status,409)
  assert.notEqual((await request(`/notes/${destination.id}/images/attach`,users[2],{sources:[urls[0]]})).status,200)
  assert.equal((await request(`/notes/${destination.id}/images/attach`,users[0],{sources:[urls[0]]})).status,200)
  assert.equal((await request(destinationMedia,users[2])).status,200)
  checks.push('Injected cross-note reference does not gain authority when owner reads/publishes; explicit attachment requires source read permission')
  await stack.pool.query('UPDATE notes SET is_trashed=true WHERE id=$1',[note.id])
  assert.notEqual((await media(urls[0],users[0])).status,200)
  await stack.pool.query('UPDATE notes SET is_trashed=false,deleted_at=now() WHERE id=$1',[note.id])
  assert.notEqual((await media(urls[0],users[0])).status,200)
  await stack.pool.query('UPDATE notes SET deleted_at=NULL WHERE id=$1',[note.id])
  assert.equal((await media(urls[0],users[0])).status,200)
  checks.push('Trash and logical deletion deny image reads; restore preserves the original')
  const key=decodeURIComponent(new URL(urls[0]).pathname.split('/runly-notes/')[1])
  const capability=await admin.storage.from('runly-notes').createSignedUrl(key,1);assert.equal(capability.error,null)
  assert.equal((await fetch(capability.data.signedUrl)).status,200);await wait(2200);assert.notEqual((await fetch(capability.data.signedUrl)).status,200)
  checks.push('A Storage signed URL is a temporary capability and expires; production resolver emits none')
  await stack.compose(['stop','supabase-storage']);assert.equal((await media(urls[0],users[0])).status,503)
  await stack.compose(['start','supabase-storage']);for(let i=0;i<80;i++){if((await media(urls[0],users[0])).status===200)break;await wait(250)}
  assert.equal((await media(urls[0],users[0])).status,200)
  checks.push('Storage outage fails closed and reads recover without changing content')
  const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:stack.pool.options.connectionString})})
  try {
    await stack.pool.query('CREATE ROLE fixture_notes_app NOLOGIN')
    await stack.pool.query('GRANT fixture_notes_app TO postgres')
    await stack.pool.query('GRANT USAGE ON SCHEMA storage TO fixture_notes_app')
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SET LOCAL ROLE fixture_notes_app`
      await ensureNotesStoragePolicy(tx)
      await ensureNotesBucketGuard(tx)
    })
    await assert.rejects(prisma.$transaction(async tx=>{
      await tx.$executeRaw`DROP POLICY runly_notes_private_images_v1 ON storage.objects`
      await tx.$executeRaw`SET LOCAL ROLE fixture_notes_app`
      await ensureNotesStoragePolicy(tx)
    }),/NOTES_STORAGE_OWNER_PREPARATION_REQUIRED/)
    checks.push('Restrictive policy defeats a broad read grant; prepared policy works without Storage ownership; missing owner preparation fails before API startup')
    // Only the remote image supplier is a fixture. Validation, upload, Notes
    // authorization, CRDT append and persistence use real production services.
    const notesService=createNotesService({prisma,supabaseAdmin:admin,fetchImpl:async()=>new Response(png,{status:200})})
    await notesService.appendToNote({noteId:note.id,userId:users[0].id,companyId:company.id,text:'Imagen desde MirAI',images:[{url:'https://example.com/fixture.png',alt:'Fixture MCP'}]})
    await notesService.appendToNote({noteId:note.id,userId:users[0].id,companyId:company.id,text:'Copia privada desde MirAI',images:[{url:urls[0],alt:'Copia privada autorizada'}]})
    const row=(await stack.pool.query('SELECT content FROM notes WHERE id=$1',[note.id])).rows[0]
    const {collectNoteImageReferences}=await import('../apps/api/src/routes/notes/image-references.js')
    const refs=collectNoteImageReferences(row)
    assert.ok(refs.length>=2)
    const bindings=(await stack.pool.query('SELECT count(*)::int AS count FROM note_image_binding WHERE note_id=$1',[note.id])).rows[0].count
    assert.ok(bindings>=3)
    const imageService=createNoteImageService({prisma,supabaseAdmin:admin})
    const inventory=await imageService.inventoryLegacy({dryRun:true});assert.deepEqual(inventory.problems,[])
    checks.push('MirAI/MCP append path validates, uploads privately, binds the image and appends real Y.Doc without replacing historical references')
  } finally {await prisma.$disconnect()}
  await request(`/notes/${destination.id}`,users[2],{content:`<img src="${signed.publicUrl}">`},'PATCH')
  const unboundAfterRestart=`/notes/${destination.id}/media?src=${encodeURIComponent(signed.publicUrl)}`
  assert.notEqual((await request(unboundAfterRestart,users[0])).status,200)
  await stack.compose(['restart','runly-api'],{log:join(stack.directory,'restart-api.log')})
  for(let i=0;i<100;i++){try{if((await fetch(stack.urls.api+'/health')).ok)break}catch{}await wait(250)}
  assert.equal((await media(urls[0],users[0])).status,200)
  assert.notEqual((await request(unboundAfterRestart,users[0])).status,200)
  checks.push('API restart resumes prepared storage without reinventoring untrusted references or duplicating grants')
  if(process.argv.includes('--advisors')) {
    const target=new URL(stack.pool.options.connectionString);target.searchParams.set('sslmode','disable')
    const report=join(stack.directory,'supabase-advisors.log')
    if(process.platform==='win32')await command('powershell.exe',['-NoProfile','-Command','pnpm dlx supabase db advisors --db-url $env:RUNLY_NOTES_ADVISOR_TARGET --type security --level warn --fail-on none *> $env:RUNLY_NOTES_ADVISOR_REPORT; exit $LASTEXITCODE'],{env:{...process.env,RUNLY_NOTES_ADVISOR_TARGET:target.href,RUNLY_NOTES_ADVISOR_REPORT:report},log:join(stack.directory,'advisors-command.log')})
    else await command('pnpm',['dlx','supabase','db','advisors','--db-url',target.href,'--type','security','--level','warn','--fail-on','none'],{env:process.env,log:report})
    checks.push('Supabase security advisors ran against the disposable DB; new private tables have RLS and no anon/authenticated read grants')
  }
  if(process.argv.includes('--ui')) {
    // Negative disable/trash cases can legitimately revoke share grants.
    // Establish the reader's new explicit grant before exercising its UI.
    await stack.pool.query("INSERT INTO note_shares(note_id,shared_with_user_id,shared_by_user_id,permission) VALUES($1,$2,$3,'read') ON CONFLICT(note_id,shared_with_user_id) DO UPDATE SET permission='read'",[note.id,users[1].id,users[0].id])
    const ui=await verifyNotesImagesUi(stack,{users,company,noteId:note.id,canvasId:canvasNote.id,source:legacyPublicUrl,publish:async(id=note.id)=>{
      const response=await request(`/notes/${id}/publish`,users[0],{});assert.equal(response.status,200)
      return (await response.json()).note.public_slug
    }})
    checks.push(...ui.checks)
  }
  const result={passed:true,upgrade,checks,stack:stack.name,apiImage:image}
  await writeFile(join(stack.directory,'notes-storage-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
} catch(error){await writeFile(join(stack.directory,'notes-storage-failure.json'),JSON.stringify({message:error.message,checks},null,2));throw error}
finally{await stack.close()}
