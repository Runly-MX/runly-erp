// Local-only immutable builds. No registry destination, push or deployment path.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createReadStream} from 'node:fs'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {command} from './fixtures/studio/supabase-stack.mjs'

assert.ok(process.argv.slice(2).every(arg=>/^--revision=.+$/.test(arg)),'Only --revision is supported')
const ref=process.argv.find(arg=>arg.startsWith('--revision='))?.slice(11)??'HEAD'
const revision=execFileSync('git',['rev-parse','--verify',`${ref}^{commit}`],{encoding:'utf8'}).trim()
const endpoint=await command('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'])
assert.match(endpoint,/^(npipe:|unix:)/,'A local Docker engine is required')
// Use the checked context's built-in builder, never a separately selected
// Buildx instance that might point at another machine.
const builder=await command('docker',['context','show'])
const short=revision.slice(0,8),directory=resolve('.artifacts/studio',`build-${short}`),archive=join(directory,'source.tar'),images={}
await mkdir(directory,{recursive:true})
execFileSync('git',['archive','--format=tar',`--output=${archive}`,revision])
for(const kind of ['api','web','worker']){
  const tag=`runly-studio-rc2:${short}-${kind}`
  await command('docker',['buildx','build','--builder',builder,'--platform','linux/amd64','--load','--label',`org.opencontainers.image.revision=${revision}`,
    '-f',`infra/docker/${kind}.Dockerfile`,'-t',tag,'-'],{input:createReadStream(archive),log:join(directory,`${kind}.log`)})
  const [image]=JSON.parse(await command('docker',['image','inspect',tag]))
  assert.equal(image.Config.Labels['org.opencontainers.image.revision'],revision)
  images[kind]={tag,id:image.Id};console.log(`${kind}: ${tag} ${image.Id}`)
}
await writeFile(join(directory,'build-result.json'),JSON.stringify({revision,images},null,2))
console.log(`Local API/Web/Worker built from ${revision}`)
