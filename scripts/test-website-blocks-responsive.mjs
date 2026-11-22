import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {dirname,resolve} from 'node:path'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium,webkit} from 'playwright'
const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url)),{createServer}=await import(pathToFileURL(require.resolve('vite')).href)
const baseline=process.argv.includes('--baseline'),captureOnly=process.argv.includes('--capture'),atlas=resolve(fileURLToPath(new URL('../../atlas-web-builder',import.meta.url)))
const output=resolve('.artifacts/website-responsive-foundation'),results=[];await mkdir(output,{recursive:true})
const server=await createServer({configFile:false,logLevel:'error',optimizeDeps:{force:true},root:fileURLToPath(new URL('./fixtures/website-responsive',import.meta.url)),plugins:baseline?[{name:'baseline-width-rules',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/website-blocks/src/responsiveCss.js'))return 'export const responsiveCss=value=>value'}}]:[],resolve:{dedupe:['react','react-dom'],alias:[{find:/^@raulbellosom\/atlas-web-builder\/styles$/,replacement:resolve(atlas,'dist/style.css')},{find:/^@raulbellosom\/atlas-web-builder$/,replacement:resolve(atlas,'dist/atlas-web-builder.js')},{find:'react-dom',replacement:dirname(require.resolve('react-dom/package.json'))},{find:'react',replacement:dirname(require.resolve('react/package.json'))}]},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),atlas]}}})
await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`
try{
 for(const [name,engine] of baseline?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch()
  try{
   const page=await browser.newPage({viewport:{width:1920,height:1000},reducedMotion:'reduce'})
   await page.route('**/*',async route=>{const req=route.request();if(req.url().startsWith(origin))return route.continue();if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#dadada"/></svg>'});return route.abort()})
   const errors=[];page.on('pageerror',error=>errors.push(error.message))
   for(const width of baseline||captureOnly?[320,820,1440]:[320,360,390,768,820,1024,1280,1440,1920]){
    await page.goto(`${origin}/?audit=StoreNavbarBlock&width=${width}`)
    await page.waitForFunction(()=>window.foundationBlockTypes?.length>0&&typeof window.foundationAudit==='function')
    const types=(await page.evaluate(()=>window.foundationBlockTypes)).filter(type=>!captureOnly||['AgencyVoicesBlock','MercadoHeaderBlock','CartPageBlock'].includes(type))
    for(const type of types){
     errors.length=0;await page.evaluate(type=>window.foundationAudit(type),type)
     await page.locator(`[data-atlas-page="${type}"]`).waitFor()
     await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
     const measurements=await page.locator(`[data-atlas-page="${type}"]`).evaluate(root=>{const bounds=root.getBoundingClientRect();return {overflow:root.scrollWidth>root.clientWidth+1,width:root.clientWidth,scrollWidth:root.scrollWidth,offenders:[...root.querySelectorAll('*')].filter(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return rect.width>0&&style.visibility!=='hidden'&&!node.closest('[aria-hidden=true]')&&(rect.right>bounds.right+1||rect.left<bounds.left-1)}).slice(0,4).map(node=>({tag:node.tagName,cls:String(node.className).slice(0,80)}))}})
     results.push({browser:name,type,width,...measurements,errors:[...errors]})
     if(measurements.overflow&&width===320)await page.screenshot({path:resolve(output,`${baseline?'baseline':'audit'}-${name}-${type}-320.png`)})
     if(captureOnly)await page.screenshot({path:resolve(output,`capture-${name}-${type}-${width}.png`)})
    }
    console.log(`${baseline?'Baseline':'Audit'} ${name}: ${types.length} blocks at ${width}px.`)
   }
   await page.close()
  }finally{await browser.close()}
 }
}finally{await server.close();await writeFile(resolve(output,baseline?'blocks-baseline.json':captureOnly?'blocks-captures.json':'blocks-results.json'),JSON.stringify(results,null,2)+'\n')}
const issues=results.filter(result=>result.overflow||result.errors.length)
console.log(JSON.stringify({cases:results.length,issues:issues.map(({browser,type,width,overflow,errors,offenders})=>({browser,type,width,overflow,errors,offenders}))},null,2))
if(!baseline&&issues.length)process.exitCode=1
