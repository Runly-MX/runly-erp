import {createRequire} from 'node:module'
const {build}=createRequire(new URL('../apps/api/package.json',import.meta.url))('esbuild')
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve,dirname,join} from 'node:path'
import {createHash} from 'node:crypto'
async function candidateAliases(atlasRoot) {
  if(!atlasRoot)return undefined
  if(process.env.NODE_ENV==='production')throw new Error('WEBSITE_EDITOR_CANDIDATE_LOCAL_ONLY')
  const pkg=JSON.parse(await readFile(resolve(atlasRoot,'package.json'),'utf8'))
  if(pkg.name!=='@raulbellosom/atlas-web-builder'||pkg.version!=='0.9.0')throw new Error('WEBSITE_RESPONSIVE_CANDIDATE_REQUIRED')
  const consumer=createRequire(new URL('../apps/desktop/package.json',import.meta.url))
  return {'@raulbellosom/atlas-web-builder':resolve(atlasRoot,'dist/atlas-web-builder.js'),'@raulbellosom/atlas-web-builder/styles':resolve(atlasRoot,'dist/style.css'),...Object.fromEntries(['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom','react-dom/client','react-dom/server'].map(name=>[name,consumer.resolve(name)]))}
}
export async function buildWebsitePublicRuntime(output,{atlasRoot}={}) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const requireDesktop=createRequire(new URL('../apps/desktop/package.json',import.meta.url))
  const alias=await candidateAliases(atlasRoot)
  const packageFile=atlasRoot?resolve(atlasRoot,'package.json'):resolve(dirname(requireDesktop.resolve('@raulbellosom/atlas-web-builder')),'..','package.json')
  const rendererVersion=JSON.parse(await readFile(packageFile,'utf8')).version
  if(!alias&&!['0.3.5','0.4.0','0.5.0','0.5.1','0.6.0','0.6.1','0.6.2','0.6.3','0.8.1','0.8.2','0.9.0','0.9.1','0.9.2','0.9.3'].includes(rendererVersion))throw new Error(`Builder version ${rendererVersion} requires an explicitly reviewed runtime update`)
  const result=await build({alias,absWorkingDir:root,entryPoints:['apps/desktop/src/website/public-release-entry.jsx'],bundle:true,write:false,outdir:'runtime',platform:'browser',format:'esm',jsx:'automatic',minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"PROD":true,"DEV":false}'},loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'}})
  const inputs=Object.keys(result.metafile.inputs)
  if(inputs.some(p=>/AuthProvider|supabaseClient|shell\/|modules\/runly\./.test(p)))throw new Error('Public runtime imports an administrative entry')
  const files={}
  for(const file of result.outputFiles) {
    const name=file.path.endsWith('.css')?'style.css':'entry.js',bytes=Buffer.from(file.contents)
    files[name]={bytes,rendererVersion,mime:name.endsWith('.css')?'text/css':'text/javascript',hash:createHash('sha256').update(bytes).digest('hex')}
  }
  if(output){await mkdir(output,{recursive:true});for(const[name,file]of Object.entries(files))await writeFile(join(output,name),file.bytes);await writeFile(join(output,'registry.json'),JSON.stringify(Object.fromEntries(Object.entries(files).map(([name,file])=>[name,{hash:file.hash,mime:file.mime,rendererVersion:file.rendererVersion}]))))}
  return files
}
// Node build of the same renderer, for server-side rendering of published pages. `ssr.json` pins the client entry it
// matches: the API only pre-renders releases that load exactly this runtime, so hydration sees the same code.
export async function buildWebsiteSsr(output,entryHash,{atlasRoot}={}) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const result=await build({alias:await candidateAliases(atlasRoot),absWorkingDir:root,entryPoints:['apps/desktop/src/website/public-release-ssr.jsx'],bundle:true,write:false,outfile:'ssr.mjs',platform:'node',format:'esm',jsx:'automatic',minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"PROD":true,"DEV":false}'},loader:{'.css':'empty','.woff2':'empty','.woff':'empty','.ttf':'empty'},banner:{js:"import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"}})
  if(Object.keys(result.metafile.inputs).some(p=>/AuthProvider|supabaseClient|shell\/|modules\/runly\./.test(p)))throw new Error('SSR runtime imports an administrative entry')
  const bytes=Buffer.from(result.outputFiles.find(f=>f.path.endsWith('.mjs')).contents)
  if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'ssr.mjs'),bytes);await writeFile(join(output,'ssr.json'),JSON.stringify({entryHash,hash:createHash('sha256').update(bytes).digest('hex')}))}
  return bytes
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const output=resolve(process.argv[2]??'.artifacts/website-public-runtime')
  const files=await buildWebsitePublicRuntime(output)
  await buildWebsiteSsr(output,files['entry.js'].hash)
}
