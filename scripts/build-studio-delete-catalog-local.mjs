// Isolated local builds: committed baseline plus only this task's overlays.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname, join } from 'node:path'
import { command } from './fixtures/studio/supabase-stack.mjs'
const endpoint=await command('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'])
if(!/^(npipe:|unix:)/.test(endpoint))throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
const files=[
  'apps/api/src/index.js','apps/api/src/routes/studio/index.js','apps/api/src/routes/studio/studio-service.js','apps/api/src/manifests/official/help/runly.studio/overview.md',
  'apps/api/src/routes/studio/catalog/network.js','apps/api/src/routes/studio/catalog/service.js','apps/api/src/routes/studio/catalog/test-network.js','apps/api/src/routes/studio/catalog/local-icons.js','apps/api/src/routes/studio/catalog/local-icons.json','apps/api/src/routes/studio/catalog/local-icons.LICENSE.txt',
  'apps/desktop/src/modules/runly.studio/components/DesignEditor.jsx','apps/desktop/src/modules/runly.studio/components/StudioCreativeResources.jsx',
  'apps/desktop/src/modules/runly.studio/components/editor/collaboration/AccessLost.jsx','apps/desktop/src/modules/runly.studio/components/home/DesignCard.jsx','apps/desktop/src/modules/runly.studio/components/home/DesignsList.jsx',
  'apps/desktop/src/modules/runly.studio/lib/catalog-errors.js','apps/desktop/src/modules/runly.studio/lib/resource-queue.js','apps/desktop/src/modules/runly.studio/lib/design-retirement.js',
  'apps/shared/studio/licenses.js','packages/sdk/src/domains/studio.js',
  'prisma/migrations/20261211000000_studio_retired_asset_lineage/migration.sql','infra/docker/api.Dockerfile','scripts/diagnose-studio-catalog.mjs',
]
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sources=await Promise.all(files.map(async file=>[file,await readFile(file)]))
// Another session owns the responsive RESOURCE_GRID change in StudioResources.
// Do not mix its uncommitted import with the committed baseline in this build.
const resources=execFileSync('git',['show',`${head}:apps/desktop/src/modules/runly.studio/components/StudioResources.jsx`],{encoding:'utf8'})
if(!/export\s+const\s+RESOURCE_GRID/.test(resources)){
  const entry=sources.find(([file])=>file.endsWith('/StudioCreativeResources.jsx'))
  entry[1]=Buffer.from(entry[1].toString('utf8').replace('{ RESOURCE_GRID, StudioResources }','{ StudioResources }').replaceAll('className={RESOURCE_GRID}','className="grid grid-cols-3 gap-2"'))
}
const digest=createHash('sha256').update(head);for(const[file,bytes]of sources)digest.update(file).update(bytes)
const version=digest.digest('hex').slice(0,12),directory=resolve('.artifacts/studio',`delete-catalog-build-${version}`),source=join(directory,'source')
await mkdir(source,{recursive:true})
const archive=join(directory,'source.tar');execFileSync('git',['archive','--format=tar','--output',archive,head]);execFileSync('tar',['-xf',archive,'-C',source])
for(const[file,bytes]of sources){const target=join(source,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)}
const images={}
for(const kind of ['api','web','worker']){
  const image=`runly-studio-deletecat:${version}-${kind}`
  await command('docker',['build','--pull=false','-f',join(source,`infra/docker/${kind}.Dockerfile`),'-t',image,'--label',`org.opencontainers.image.revision=${head}`,source],{log:join(directory,`${kind}.log`)})
  images[kind]=image;console.log(`Local ${kind} build: ${image}`)
}
await writeFile('.artifacts/studio/delete-catalog-build.json',JSON.stringify({head,version,images,files},null,2))
