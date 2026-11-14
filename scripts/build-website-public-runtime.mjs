import {createRequire} from 'node:module'
const {build}=createRequire(new URL('../apps/api/package.json',import.meta.url))('esbuild')
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve,dirname,join} from 'node:path'
import {createHash} from 'node:crypto'
export async function buildWebsitePublicRuntime(output) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const requireDesktop=createRequire(new URL('../apps/desktop/package.json',import.meta.url))
  const packageFile=resolve(dirname(requireDesktop.resolve('@raulbellosom/atlas-web-builder')),'..','package.json')
  const rendererVersion=JSON.parse(await readFile(packageFile,'utf8')).version
  if(!['0.3.5','0.4.0','0.5.0','0.5.1'].includes(rendererVersion))throw new Error('Builder version requires an explicitly reviewed runtime update')
  const result=await build({absWorkingDir:root,entryPoints:['apps/desktop/src/website/public-release-entry.jsx'],bundle:true,write:false,outdir:'runtime',platform:'browser',format:'esm',jsx:'automatic',minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"PROD":true,"DEV":false}'},loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'}})
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
export async function buildWebsiteSsr(output,entryHash) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const result=await build({absWorkingDir:root,entryPoints:['apps/desktop/src/website/public-release-ssr.jsx'],bundle:true,write:false,outfile:'ssr.mjs',platform:'node',format:'esm',jsx:'automatic',minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"PROD":true,"DEV":false}'},loader:{'.css':'empty','.woff2':'empty','.woff':'empty','.ttf':'empty'},banner:{js:"import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"}})
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
