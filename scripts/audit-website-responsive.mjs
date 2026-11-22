import {createRequire,Module} from 'node:module'
import {fileURLToPath} from 'node:url'
import {readFile,readdir,writeFile} from 'node:fs/promises'
import {resolve,dirname,relative} from 'node:path'
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url))
const {build}=createRequire(new URL('../apps/api/package.json',import.meta.url))('esbuild')
const root=fileURLToPath(new URL('../',import.meta.url)),source=resolve(root,'packages/website-blocks/src')
const files=await readdir(source),texts=new Map(await Promise.all(files.filter(file=>/\.(jsx?|css)$/.test(file)).map(async file=>[file,await readFile(resolve(source,file),'utf8')])))
{
  const bundle=await build({entryPoints:[resolve(source,'index.js')],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent'})
  const filename=resolve(root,'apps/desktop/.responsive-audit.cjs'),module=new Module(filename)
  module.filename=filename;module.paths=Module._nodeModulePaths(dirname(filename));module._compile(bundle.outputFiles[0].text,filename)
  const blocks=module.exports
  const groups={universal:blocks.universalRunlyBlocks,ecommerce:blocks.ecommerceRunlyBlocks,bookings:blocks.bookingsRunlyBlocks,restaurant:blocks.restaurantRunlyBlocks}
  const inventory=[]
  let browserResults=[]
  try{browserResults=JSON.parse(await readFile(resolve(root,'.artifacts/website-responsive-foundation/blocks-results.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  for(const [group,list] of Object.entries(groups))for(const block of list){
    const escaped=block.type.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
    const matches=[...texts].filter(([,text])=>new RegExp(`type\\s*:\\s*['"]${escaped}['"]|export const ${escaped}\\b`).test(text))
    const file=matches[0]?.[0]??null,visited=new Set()
    function collect(name){
      if(visited.has(name)||!texts.has(name))return ''
      visited.add(name);const text=texts.get(name)
      return text+'\n'+[...text.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)].map(match=>collect(match[1])).join('\n')
    }
    const code=file?collect(file):''
    const widths=/@media\s*\([^)]*(?:min|max)-width/.test(code),converted=code.includes('responsiveCss(')
    inventory.push({type:block.type,group,source:file?relative(root,resolve(source,file)).replaceAll('\\','/'):null,
      customizableFields:Object.keys(block.fields??{}),responsive:/@container/.test(code)?'container-queries':widths?(converted?'container-width-rules':'viewport-width-rules'):'intrinsic-or-unverified',
      signals:{fixedDimensions:/\b(?:width|minWidth|gridTemplateColumns)\s*:\s*(?:\d+|['"][^'"]*\d+px)/.test(code),absolutePosition:/position\s*:\s*['"]absolute/.test(code),viewportUnits:/\d(?:vw|vh)\b/.test(code),hover:/hover/.test(code),nativeControls:/<(?:button|a|input|select|textarea)\b/.test(code),aria:/aria-/.test(code),imageAlt:/\balt=/.test(code)},
      browserCoverage:{cases:browserResults.filter(result=>result.type===block.type).length,failures:browserResults.filter(result=>result.type===block.type&&(result.overflow||result.errors.length)).length},
      assessment:'Las señales estáticas no equivalen a defectos confirmados. Los casos de navegador cubren valores predeterminados; la accesibilidad completa requiere revisión manual.'})
  }
  const result={schemaVersion:1,scope:'All specialized blocks registered in the four Runly groups; shared source signals include sibling helper imports.',total:inventory.length,blocks:inventory.sort((a,b)=>a.type.localeCompare(b.type))}
  await writeFile(resolve(root,'docs/architecture/website-blocks-responsive-inventory.json'),JSON.stringify(result,null,2)+'\n')
  console.log(`Inventory: ${inventory.length} registered specialized blocks.`)
}
