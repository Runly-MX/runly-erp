// Derive a test image from the measured baseline with ONLY the owned overlays.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { command } from './fixtures/studio/supabase-stack.mjs'
const base = 'runly-realtime2:baseline-api'
const files = ['apps/api/src/services/realtime-access-service.js', 'apps/api/src/services/realtime-broadcaster.js']
const endpoint = await command('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'])
if(!/^(npipe:|unix:)/.test(endpoint))throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
const digest = createHash('sha256').update(base), sources = []
for(const file of files) {const bytes = await readFile(file);digest.update(file).update(bytes);sources.push([file,bytes])}
const hash = digest.digest('hex').slice(0,12), image = `runly-realtime2:api-${hash}`
const directory = resolve('.artifacts/realtime-2',`build-${hash}`)
await mkdir(directory,{recursive:true})
for(const[file,bytes]of sources){const target=join(directory,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)}
await writeFile(join(directory,'Dockerfile'),`FROM ${base}\n${files.map(file=>`COPY ${file} /app/${file}`).join('\n')}\n`)
await command('docker',['build','--pull=false','--network=none','-t',image,directory],{log:join(directory,'build.log')})
await writeFile(join(directory,'source.json'),JSON.stringify({base,image,files,hash},null,2))
console.log(image)
