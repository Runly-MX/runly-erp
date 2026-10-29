#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { resolveInstanceIdentity } from './lib/instance-identity.mjs'
import { createStudioDatabaseRunner, inspectStudioRealtimeFailure, prepareStudioRealtimeOwner, assertRecoverableStudioFailure, STUDIO_REALTIME_MIGRATION } from './lib/studio-realtime-db.mjs'
import { prepareExternalStudioRealtime } from './lib/studio-realtime-external.mjs'
import { getUserComposeOverrides, resolveComposeMigrationNetwork, acquireInstallerDeployment } from './lib/installer-runtime.mjs'

const directory=dirname(fileURLToPath(import.meta.url)),argv=process.argv.slice(2)
let releaseDeployment=()=>{}
try{
  releaseDeployment=acquireInstallerDeployment(directory)
  const content=await readFile(join(directory,'.env.local'),'utf8')
  if(!/^RUNLY_SUPABASE_MODE=["']?selfhosted["']?\s*$/m.test(content))throw Error('SELF_HOSTED_INSTALLER_REQUIRED')
  const identity=resolveInstanceIdentity(content)
  const env={...process.env,RUNLY_COMPOSE_PROJECT_NAME:identity.projectName,RUNLY_CONTAINER_PREFIX:identity.containerPrefix}
  // Compose interpolation uses .env; .env.local belongs to application jobs.
  const composeArgs=['-f',join(directory,'docker-compose.yml'),'-f',join(directory,'supabase/docker-compose.supabase.yml'),...getUserComposeOverrides(directory,'local')]
  const execute=createStudioDatabaseRunner({composeArgs,cwd:directory,env})
  const state=inspectStudioRealtimeFailure(execute)
  console.log(JSON.stringify({migration:STUDIO_REALTIME_MIGRATION,failed:state.failed.map(f=>({name:f.name,checksum:f.checksum,failureDetailsAvailable:Boolean(f.logs?.trim()),ownerPreparationMissing:Boolean(f.logs?.includes('STUDIO_SOCKET_SCHEMA_OWNER_REQUIRED: run owner-phase provisioning first'))})),transactionObjectsAbsent:state.clean},null,2))
  if(argv.includes('--recover-known-failure')){
    assertRecoverableStudioFailure(state)
    const image=argv.find(v=>v.startsWith('--api-image='))?.slice('--api-image='.length)
    if(!image||image.startsWith('-')||!/^[a-zA-Z0-9][a-zA-Z0-9./_:@-]+$/.test(image))throw Error('EXPLICIT_API_IMAGE_REQUIRED')
    const value=key=>{const raw=new RegExp(`^${key}=(.*)$`,'m').exec(content)?.[1]?.trim()??'';return raw.replace(/^(["'])(.*)\1$/,'$2')}
    const target=new URL(value('DIRECT_URL')||value('DATABASE_URL'))
    if(!['postgres:','postgresql:'].includes(target.protocol)||target.hostname!=='supabase-db'||!['','5432'].includes(target.port)||target.pathname!=='/postgres'||!['public',null].includes(target.searchParams.get('schema')))throw Error('SELF_HOSTED_MIGRATION_TARGET_MISMATCH')
    const networkArgs=resolveComposeMigrationNetwork({cwd:directory,composeArgs,env})
    prepareExternalStudioRealtime({ image, envFile:join(directory,'.env.local'), cwd:directory, diagnose:true, dockerArgs:networkArgs })
    await prepareStudioRealtimeOwner({execute,sqlFile:join(directory,'supabase/volumes/db/studio-realtime-role.sql')})
    assertRecoverableStudioFailure(inspectStudioRealtimeFailure(execute))
    const result=spawnSync('docker',['run','--rm','--pull=never',...networkArgs,'--env-file',join(directory,'.env.local'),'--entrypoint','node',image,'node_modules/prisma/build/index.js','migrate','resolve','--rolled-back',STUDIO_REALTIME_MIGRATION],{cwd:directory,env,stdio:'inherit',shell:false})
    if(result.error||result.status!==0)throw Error('STUDIO_MIGRATION_RESOLVE_FAILED')
    console.log('Preparación completada y fallo conocido marcado como rolled back. Ejecuta de nuevo el Installer para aplicar la migración; no se marcó como aplicada.')
  }else console.log('Solo diagnóstico. No se modificó el rol, los datos ni el historial.')
}catch(error){console.error(error.message);process.exitCode=1}finally{releaseDeployment()}
