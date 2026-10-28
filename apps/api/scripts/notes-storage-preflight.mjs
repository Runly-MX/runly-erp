import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createClient } from '@supabase/supabase-js'
import { createNoteImageService } from '../src/routes/notes/image-service.js'
import { ensureNotesStoragePolicy, ensureNotesBucketGuard, inspectNotesStorage } from '../src/routes/notes/image-storage.js'
import { randomBytes } from 'node:crypto'

if(process.argv.includes('--help')) {
  console.log('Read-only: --inventory --output=<private-report.json> with DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Owner preparation: --prepare-owner with RUNLY_NOTES_OWNER_DATABASE_URL. --verify (read-only invariants, DATABASE_URL) and --probe (anonymous HTTP probe, SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY). No bucket is reopened or object moved/deleted.')
  process.exit(0)
}
const owner=process.argv.includes('--prepare-owner')
const connectionString=owner?process.env.RUNLY_NOTES_OWNER_DATABASE_URL:process.env.DATABASE_URL
if(!connectionString)throw Error('EXPLICIT_DATABASE_CONFIGURATION_REQUIRED')
// Output carries codes only, never connection strings or object data.
async function probeAnonymousAccess() {
  const base=process.env.SUPABASE_URL?.replace(/[/]$/,''),anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!base||!anon||!service)throw Error('EXPLICIT_STORAGE_CONFIGURATION_REQUIRED')
  const admin=createClient(base,service,{auth:{persistSession:false,autoRefreshToken:false}})
  const key=`__preflight__/${randomBytes(12).toString('hex')}.png`
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64')
  const uploaded=await admin.storage.from('runly-notes').upload(key,png,{contentType:'image/png',upsert:false})
  if(uploaded.error)throw Error('NOTES_PROBE_UPLOAD_FAILED')
  const problems=[]
  try {
    const headers={apikey:anon,Authorization:`Bearer ${anon}`}
    for(const [code,path] of [['PUBLIC_URL',`/storage/v1/object/public/runly-notes/${key}`],['ANON_OBJECT',`/storage/v1/object/runly-notes/${key}`],['ANON_RENDER',`/storage/v1/render/image/public/runly-notes/${key}?width=8`]]) {
      const response=await fetch(base+path,{headers});if(response.status===200)problems.push(`NOTES_PROBE_ANONYMOUS_READ:${code}`)
    }
    const listing=await fetch(`${base}/storage/v1/object/list/runly-notes`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({prefix:'__preflight__',limit:5})})
    if(listing.ok&&(await listing.json().catch(()=>[])).length)problems.push('NOTES_PROBE_ANONYMOUS_LISTING')
  } finally { await admin.storage.from('runly-notes').remove([key]).catch(()=>{}) }
  return problems
}
if(process.argv.includes('--probe')) {
  try { const problems=await probeAnonymousAccess();console.log(JSON.stringify({ok:!problems.length,problems}));process.exit(problems.length?1:0) }
  catch(error) { console.error(JSON.stringify({ok:false,problems:[String(error.message).match(/^[A-Z_]+/)?.[0]??'NOTES_PROBE_FAILED']}));process.exit(1) }
}
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString})})
try {
  if(process.argv.includes('--verify')) {
    const result=await inspectNotesStorage(prisma);console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1
  } else if(owner) { await ensureNotesStoragePolicy(prisma); await ensureNotesBucketGuard(prisma); console.log('Notes Storage restrictive policy and bucket guard prepared.'); }
  else {
    const target=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)
    if(!process.argv.includes('--inventory')||!target)throw Error('INVENTORY_AND_PRIVATE_OUTPUT_REQUIRED')
    if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('EXPLICIT_STORAGE_CONFIGURATION_REQUIRED')
    const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const report=await createNoteImageService({prisma,supabaseAdmin:admin}).inventoryLegacy({dryRun:true})
    const buckets=await prisma.$queryRaw`SELECT id,public FROM storage.buckets ORDER BY id`
    const path=resolve(target);await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify({report,buckets},null,2),{mode:0o600})
    console.log(JSON.stringify({notes:report.notes,references:report.references,problems:report.problems.length}))
    if(report.problems.length)process.exitCode=1
  }
} catch { console.error('Notes Storage preflight failed. Check private operational configuration/report; no secrets are logged.');process.exitCode=1 }
finally {await prisma.$disconnect()}
