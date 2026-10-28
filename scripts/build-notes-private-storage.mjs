import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { command } from './fixtures/studio/supabase-stack.mjs'
const base='runly-realtime2:full-api-fa6f6d2a2877'
const files=['apps/api/src/index.js','apps/api/src/routes/notes/index.js','apps/api/src/routes/notes/notes-service.js','apps/api/src/routes/notes/append-images.js','apps/api/src/routes/notes/image-service.js','apps/api/src/routes/notes/image-references.js','apps/api/src/routes/notes/image-storage.js','apps/api/src/routes/notes/image-bytes.js','apps/api/scripts/notes-storage-preflight.mjs','prisma/migrations/20261028011349_notes_private_images/migration.sql','prisma/prepare-notes-storage-owner.sql']
const endpoint=await command('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'])
if(!/^(npipe:|unix:)/.test(endpoint))throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
const hash=createHash('sha256'),sources=[]
for(const file of files){const bytes=await readFile(file);sources.push([file,bytes]);hash.update(file).update(bytes)}
const full=process.argv.includes('--full')
const digest=hash.digest('hex').slice(0,12),image=`runly-notes-private:${full?'full-api':'api'}-${digest}`,directory=resolve('.artifacts/realtime-2',`notes-${full?'full-':''}build-${digest}`)
if(full) {
  const sourceRef=await command('git',['rev-parse','HEAD']),source=join(directory,'source'),archive=join(directory,'source.tar')
  await mkdir(source,{recursive:true})
  await command('git',['archive','--format=tar','--output',archive,sourceRef])
  await command('tar',['-xf',archive,'-C',source])
  for(const[file,bytes]of sources){const target=join(source,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)}
  await command('docker',['build','--pull=false','-f',join(source,'infra/docker/api.Dockerfile'),'-t',image,source],{log:join(directory,'build.log')})
  await writeFile(join(directory,'source.json'),JSON.stringify({sourceRef,files,image,full},null,2))
  console.log(image);process.exit(0)
}
for(const[file,bytes]of sources){const target=join(directory,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)}
await writeFile(join(directory,'Dockerfile'),`FROM ${base}\n${files.map(file=>`COPY ${file} /app/${file}`).join('\n')}\n`)
await command('docker',['build','--pull=false','--network=none','-t',image,directory],{log:join(directory,'build.log')})
await writeFile(join(directory,'source.json'),JSON.stringify({base,files,image},null,2))
console.log(image)
