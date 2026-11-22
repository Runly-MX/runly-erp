// Local browser regression: real Atlas editor/renderers and shared Runly blocks, no saved site or publication.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdir,writeFile} from 'node:fs/promises'
import {dirname,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {chromium,webkit} from 'playwright'

const require=createRequire(new URL('../apps/desktop/package.json',import.meta.url))
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href)
const atlas=resolve(process.env.ATLAS_SOURCE_DIR??fileURLToPath(new URL('../../atlas-web-builder',import.meta.url)))
const output=resolve('.artifacts/website-responsive-foundation')
await mkdir(output,{recursive:true})
const server=await createServer({configFile:false,optimizeDeps:{force:true},root:fileURLToPath(new URL('./fixtures/website-responsive',import.meta.url)),logLevel:'warn',resolve:{dedupe:['react','react-dom'],alias:[
  {find:/^@raulbellosom\/atlas-web-builder\/styles$/,replacement:resolve(atlas,'dist/style.css')},
  {find:/^@raulbellosom\/atlas-web-builder$/,replacement:resolve(atlas,'dist/atlas-web-builder.js')},
  {find:'react-dom',replacement:dirname(require.resolve('react-dom/package.json'))},
  {find:'react',replacement:dirname(require.resolve('react/package.json'))},
]},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),atlas]}}})
await server.listen()
const origin=`http://127.0.0.1:${server.httpServer.address().port}`,results=[]
try{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch()
    try{
      const page=await browser.newPage({viewport:{width:1920,height:1000},reducedMotion:'reduce'})
      const errors=[];page.on('pageerror',e=>errors.push(e.message))
      const measure=()=>page.evaluate(()=>{
        const root=document.querySelector('[data-atlas-page]')??document.querySelector('.atlas-wb-canvas__frame')
        const title=root.querySelector('h1'),s=getComputedStyle(title),rect=root.getBoundingClientRect()
        return {width:root.clientWidth,font:s.fontSize,family:s.fontFamily,lineHeight:s.lineHeight,color:s.color,overflow:root.scrollWidth>root.clientWidth+1,titleWidth:title.getBoundingClientRect().width,titleHeight:title.getBoundingClientRect().height,rootWidth:rect.width}
      })
      for(const width of [320,360,390,768,820,1024,1280,1440,1920]){
        let previous
        for(const mode of ['public','preview']){
          await page.goto(`${origin}/?mode=${mode}&width=${width}`)
          await page.locator('h1').waitFor()
          const m=await measure()
          assert.equal(m.overflow,false,`${name} ${mode} ${width}: no horizontal overflow`)
          assert.equal(m.font,width<640?'28px':width<1024?'44px':'64px')
          if(previous)assert.deepEqual(m,previous,'Public and private preview must share layout')
          previous=m
          const burger=page.getByRole('button',{name:'Abrir menú',exact:true})
          assert.equal(await burger.isVisible(),width<=859)
          assert(await page.getByRole('link',{name:'Carrito',exact:true}).isVisible(),'Cart stays visible when menu is closed')
          if(width<=859){
            await burger.click()
            assert.equal(await page.getByRole('button',{name:'Cerrar menú',exact:true}).getAttribute('aria-expanded'),'true')
            assert(await page.getByRole('link',{name:'Colección',exact:true}).isVisible())
            await page.keyboard.press('Escape')
            assert(await burger.evaluate(el=>el===document.activeElement))
          }
          await page.getByRole('textbox',{name:'Correo electrónico *',exact:true}).fill('subscriber@example.test')
          await page.getByRole('button',{name:'Suscribirme',exact:true}).click()
          await page.getByText('Suscripción de prueba recibida.',{exact:true}).waitFor()
          assert.equal(await page.evaluate(()=>window.foundationSubmission.email),'subscriber@example.test')
          if(mode==='public'&&[390,820,1440].includes(width))await page.screenshot({path:resolve(output,`${name}-${width}.png`),fullPage:true})
          results.push({browser:name,mode,...m})
        }
      }
      await page.goto(`${origin}/?mode=edit`)
      await page.locator('[data-block-id="title"]').waitFor()
      await page.evaluate(()=>{window.foundation.device('mobile');window.foundation.select('title')})
      await page.getByRole('button',{name:'Tipografía',exact:true}).click()
      const input=page.locator('[data-property="mobileFontSize"] input')
      const titleSize=expected=>page.waitForFunction(value=>{const title=document.querySelector('[data-block-id="title"] h1');return getComputedStyle(title).fontSize===value&&getComputedStyle(title.firstElementChild).fontSize===value},expected)
      await input.waitFor();await input.fill('30');await input.blur()
      await titleSize('30px')
      assert.equal(await page.evaluate(()=>window.foundation.state().page.blocks.title.props.fontSize),64)
      assert.equal(await page.locator('[data-block-id="title"] h1').evaluate(el=>getComputedStyle(el).fontSize),'30px')
      await page.evaluate(()=>window.foundation.undo())
      await titleSize('28px')
      assert.equal(await page.locator('[data-block-id="title"] h1').evaluate(el=>getComputedStyle(el).fontSize),'28px')
      await page.evaluate(()=>window.foundation.redo())
      await titleSize('30px')
      await page.evaluate(()=>{window.foundation.save();window.foundation.reopen()})
      await page.locator('[data-foundation-session="1"] [data-block-id="title"]').waitFor()
      await page.evaluate(()=>{window.foundation.device('mobile');window.foundation.select('title')})
      await page.getByRole('button',{name:'Tipografía',exact:true}).click()
      await titleSize('30px')
      assert.equal(await page.locator('[data-block-id="title"] h1').evaluate(el=>getComputedStyle(el).fontSize),'30px')
      await page.locator('[data-property="mobileFontSize"]').getByRole('button',{name:/^Restablecer/}).click()
      await titleSize('44px')
      assert.equal(await page.locator('[data-block-id="title"] h1').evaluate(el=>getComputedStyle(el).fontSize),'44px')
      assert.equal(await page.evaluate(()=>window.foundation.state().page.blocks.title.props.mobileFontSize),undefined)
      await page.locator('[data-property="mobileFontSize"] input').fill('28')
      await titleSize('28px')
      const publicMobile=results.find(result=>result.browser===name&&result.mode==='public'&&result.width===390)
      const edited=await measure()
      for(const key of ['font','family','lineHeight','color','titleWidth','titleHeight'])assert.equal(edited[key],publicMobile[key],`Editor/public ${key} parity`)
      await page.evaluate(()=>window.foundation.state().updateBlockProps('title',{mobileWidthMode:'fixed',mobileWidth:600}))
      await page.locator('.atlas-wb-overflow-diagnostics summary').waitFor()
      await page.locator('.atlas-wb-overflow-diagnostics summary').click()
      await page.getByRole('button',{name:'Revisar TextElementBlock · title',exact:true}).click()
      assert.equal(await page.evaluate(()=>window.foundation.state().selectedId),'title')
      await page.evaluate(()=>window.foundation.undo())
      await page.locator('.atlas-wb-overflow-diagnostics').waitFor({state:'hidden'})
      await page.evaluate(()=>window.foundation.select(null))
      await page.screenshot({path:resolve(output,`${name}-editor-390-in-1920.png`)})
      assert.deepEqual(errors,[])
      results.push({browser:name,mode:'edit',viewport:1920,canvas:390,editUndoRedoResetReopen:true})
      await page.close()
    }finally{await browser.close()}
  }
}finally{
  await server.close()
  await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2)+'\n')
}
console.log(`Responsive foundation: ${results.length} browser cases passed.`)
