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
  if(JSON.parse(await readFile(packageFile,'utf8')).version!=='0.2.0')throw new Error('Builder version requires an explicitly reviewed runtime update')
  const result=await build({absWorkingDir:root,entryPoints:['apps/desktop/src/website/public-release-entry.jsx'],bundle:true,write:false,outdir:'runtime',platform:'browser',format:'esm',jsx:'automatic',minify:true,metafile:true,define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"PROD":true,"DEV":false}'},loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'}})
  const inputs=Object.keys(result.metafile.inputs)
  if(inputs.some(p=>/AuthProvider|supabaseClient|shell\/|modules\/runly\./.test(p)))throw new Error('Public runtime imports an administrative entry')
  const files={}
  for(const file of result.outputFiles) {
    const name=file.path.endsWith('.css')?'style.css':'entry.js',bytes=Buffer.from(file.contents)
    files[name]={bytes,mime:name.endsWith('.css')?'text/css':'text/javascript',hash:createHash('sha256').update(bytes).digest('hex')}
  }
  if(output){await mkdir(output,{recursive:true});for(const[name,file]of Object.entries(files))await writeFile(join(output,name),file.bytes);await writeFile(join(output,'registry.json'),JSON.stringify(Object.fromEntries(Object.entries(files).map(([name,file])=>[name,{hash:file.hash,mime:file.mime}]))))}
  return files
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await buildWebsitePublicRuntime(resolve(process.argv[2]??'.artifacts/website-public-runtime'))
