// Derive a test image from the measured baseline with ONLY the owned overlays.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { command } from './fixtures/studio/supabase-stack.mjs'
const base = 'runly-realtime2:baseline-api'
const files = ['apps/api/src/services/realtime-access-service.js', 'apps/api/src/services/realtime-broadcaster.js', 'apps/api/src/index.js', 'apps/api/package.json', 'pnpm-lock.yaml']
const endpoint = await command('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'])
if(!/^(npipe:|unix:)/.test(endpoint))throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
if(process.argv.includes('--baseline')) {
  const sourceRef='c5498bd3873c2f9067643fc8b018dbcc0c44b828'
  const directory=resolve('.artifacts/realtime-2','baseline-build'),source=join(directory,'source'),archive=join(directory,'source.tar')
  await mkdir(source,{recursive:true})
  await command('git',['archive','--format=tar','--output',archive,sourceRef])
  await command('tar',['-xf',archive,'-C',source])
  await command('docker',['build','--pull=false','--label',`org.opencontainers.image.revision=${sourceRef}`,'-f',join(source,'infra/docker/api.Dockerfile'),'-t',base,source],{log:join(directory,'build.log')})
  await writeFile(join(directory,'source.json'),JSON.stringify({sourceRef,image:base,full:true},null,2))
  console.log(base)
  process.exit(0)
}
const digest = createHash('sha256').update(base), sources = []
for(const file of files) {const bytes = await readFile(file);digest.update(file).update(bytes);sources.push([file,bytes])}
const full = process.argv.includes('--full')
const hash = digest.digest('hex').slice(0,12), image = `runly-realtime2:${full?'full-api':'api'}-${hash}`
const directory = resolve('.artifacts/realtime-2',`${full?'full-':''}build-${hash}`)
await mkdir(directory,{recursive:true})
if(full) {
  const sourceRef=await command('docker',['image','inspect','--format','{{index .Config.Labels "org.opencontainers.image.revision"}}',base])
  if(!/^[a-f0-9]{40}$/.test(sourceRef))throw Error('BASELINE_SOURCE_REVISION_REQUIRED')
  const archive=join(directory,'source.tar'),source=join(directory,'source')
  await mkdir(source,{recursive:true})
  await command('git',['archive','--format=tar','--output',archive,sourceRef])
  await command('tar',['-xf',archive,'-C',source])
  for(const[file,bytes]of sources){const target=join(source,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)}
  await command('docker',['build','--pull=false','-f',join(source,'infra/docker/api.Dockerfile'),'-t',image,source],{log:join(directory,'build.log')})
  await writeFile(join(directory,'source.json'),JSON.stringify({base,sourceRef,image,files,hash,full:true},null,2))
  console.log(image)
  process.exit(0)
}
for(const[file,bytes]of sources){const target=join(directory,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)}
// Baseline already contains this exact production dependency for Notes. Link
// the API's newly declared dependency without resolving/upgrading any package.
// A normal API Dockerfile build is still required as a separate release check.
const linkAwareness = `RUN node -e "const fs=require('node:fs');const p='/app/apps/api/node_modules/y-protocols';if(!fs.existsSync(p))fs.symlinkSync('../../desktop/node_modules/y-protocols',p);if(require('/app/apps/api/node_modules/y-protocols/package.json').version!=='1.0.7')throw Error('AWARENESS_VERSION_MISMATCH')"`
await writeFile(join(directory,'Dockerfile'),`FROM ${base}\n${files.map(file=>`COPY ${file} /app/${file}`).join('\n')}\n${linkAwareness}\n`)
await command('docker',['build','--pull=false','--network=none','-t',image,directory],{log:join(directory,'build.log')})
await writeFile(join(directory,'source.json'),JSON.stringify({base,image,files,hash},null,2))
console.log(image)
