import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createClient } from '@supabase/supabase-js'
import { createNoteImageService } from '../src/routes/notes/image-service.js'
import { ensureNotesStoragePolicy, ensureNotesBucketGuard } from '../src/routes/notes/image-storage.js'

if(process.argv.includes('--help')) {
  console.log('Read-only: --inventory --output=<private-report.json> with DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Owner preparation: --prepare-owner with RUNLY_NOTES_OWNER_DATABASE_URL. No bucket is reopened or object moved/deleted.')
  process.exit(0)
}
const owner=process.argv.includes('--prepare-owner')
const connectionString=owner?process.env.RUNLY_NOTES_OWNER_DATABASE_URL:process.env.DATABASE_URL
if(!connectionString)throw Error('EXPLICIT_DATABASE_CONFIGURATION_REQUIRED')
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString})})
try {
  if(owner) { await ensureNotesStoragePolicy(prisma); await ensureNotesBucketGuard(prisma); console.log('Notes Storage restrictive policy and bucket guard prepared.'); }
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
