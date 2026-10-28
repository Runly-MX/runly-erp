import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

export async function verifyNotesImagesUi(stack,{users,company,noteId,canvasId,source,publish}) {
  const directory=join(stack.directory,'notes-images-ui'),errors=[],checks=[],contexts=[]
  await mkdir(directory,{recursive:true})
  for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key]
  const require=createRequire(resolve('apps/desktop/package.json'))
  const {build,preview}=await import(pathToFileURL(require.resolve('vite')).href)
  const config={root:resolve('apps/desktop'),configFile:resolve('apps/desktop/vite.config.js'),envDir:directory,base:'/',
    define:{'import.meta.env.VITE_RUNLY_API_URL':JSON.stringify(stack.urls.api),'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(stack.urls.kong),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(stack.secret.SUPABASE_ANON_KEY)},
    build:{outDir:join(directory,'web'),emptyOutDir:true},preview:{host:'127.0.0.1',port:stack.ports.web,strictPort:true}}
  await build(config)
  const web=await preview(config),browser=await chromium.launch({channel:'chrome',headless:true})
  async function pageFor(user,mobile=false) {
    const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:mobile?{width:390,height:844}:{width:1440,height:1000},...(mobile?{isMobile:true,hasTouch:true}:{})});contexts.push(context)
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());return /^https?:$/.test(url.protocol)&&!['127.0.0.1','localhost'].includes(url.hostname)?route.abort():route.continue()
    })
    await context.addInitScript(id=>localStorage.setItem('runly-active-company',id),company.id)
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
    if(user){
      await page.goto(stack.urls.web+'/app/login');await page.locator('#identifier').fill(user.email);await page.locator('#password').fill(user.password)
      await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('/login'))
    }
    return page
  }
  async function notePage(user,mobile=false) {
    const page=await pageFor(user,mobile)
    const trail=[],t0=Date.now(),mark=text=>trail.push(`${Date.now()-t0}ms ${text}`)
    const failed=[],consoleErrors=[]
    page.on('requestfailed',request=>failed.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`))
    page.on('response',response=>{if(response.status()>=400)failed.push(`${response.status()} ${response.url()}`)})
    page.on('console',message=>{if(['error','warning'].includes(message.type()))consoleErrors.push(message.text().slice(0,300))})
    await page.goto(`${stack.urls.web}/app/m/runly.notes/?note=${noteId}`)
    mark('goto done')
    // No tapping fallback: the deep link itself must open the note (a fallback once masked a lost ?note= parameter).
    try { await page.locator('.ProseMirror:visible').first().waitFor({timeout:30000}) }
    catch(error) {
      // Failure evidence for diagnosis only; the assertion itself is unchanged.
      const out=process.env.RUNLY_NOTES_MOBILE_DIAG
      if(out) {
        await mkdir(out,{recursive:true})
        await page.screenshot({path:join(out,'failure.png')}).catch(()=>{})
        const dom=await page.evaluate(()=>({url:location.href,title:document.title,text:document.body.innerText.slice(0,2000),editors:[...document.querySelectorAll('.ProseMirror')].map(x=>({visible:!!x.offsetParent,rect:x.getBoundingClientRect().toJSON(),editable:x.getAttribute('contenteditable')})),h3:[...document.querySelectorAll('h3')].map(x=>({text:x.textContent.slice(0,60),visible:!!x.offsetParent})),sheet:!!document.querySelector('.note-sheet'),rootChildren:document.querySelector('#root')?.children.length,width:innerWidth})).catch(e=>({evaluateFailed:String(e.message)}))
        await writeFile(join(out,'failure.json'),JSON.stringify({trail,failed,consoleErrors,errors,dom},null,2))
      }
      throw error
    }
    mark('editor wait ok')
    await imagesLoaded(page)
    return page
  }
  async function imagesLoaded(page) {
    await page.waitForFunction(()=>{
      const root=document.querySelector('.note-sheet');if(!root)return false
      const images=[...root.querySelectorAll('img')].filter(x=>x.src.startsWith('blob:'))
      return images.length>=2&&images.every(x=>x.naturalWidth===64)
    },null,{timeout:30000})
  }
  try {
    const owner=await notePage(users[0]),reader=await notePage(users[1])
    await owner.screenshot({path:join(directory,'historical-desktop.png')})
    checks.push('Real Tiptap historical Y.Doc body and legacy-bucket cover render for owner and reader')
    await owner.route('**/images/attach',async route=>{await new Promise(resolve=>setTimeout(resolve,1000));await route.continue()})
    const attached=owner.waitForResponse(response=>response.url().includes('/images/attach')&&response.status()===200)
    await owner.locator('.ProseMirror:visible').first().focus()
    await owner.keyboard.press('Control+End')
    await owner.locator('.ProseMirror:visible').first().evaluate((editor,source)=>{
      const clipboard=new DataTransfer();clipboard.setData('text/html',`<p>Imagen pegada autorizada</p><img src="${source}"><p>Continua aqui: </p>`)
      editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}))
    },source)
    await owner.keyboard.type('Edicion durante autorizacion')
    await owner.keyboard.press('Shift+Home')
    await attached
    await owner.unroute('**/images/attach')
    await reader.getByText('Imagen pegada autorizada',{exact:true}).first().waitFor()
    await reader.locator('.ProseMirror:visible').filter({hasText:'Edicion durante autorizacion'}).first().waitFor()
    await imagesLoaded(reader)
    await reader.waitForTimeout(300)
    assert.ok((await reader.locator('.ProseMirror:visible').first().innerText()).includes('Edicion durante autorizacion'))
    checks.push('Rich paste explicitly authorizes image attachment and live Y.js peer keeps historical images')
    const mobile=await notePage(users[0],true)
    await mobile.locator('.ProseMirror:visible').first().focus();await mobile.keyboard.press('Control+End')
    await mobile.keyboard.type('Edicion movil verificada')
    await reader.locator('.ProseMirror:visible').filter({hasText:'Edicion movil verificada'}).first().waitFor()
    await imagesLoaded(mobile)
    await mobile.screenshot({path:join(directory,'historical-mobile.png')})
    checks.push('Touch mobile viewport edits collaboratively and keeps private historical images')
    const slug=await publish(),publicPage=await pageFor(null)
    await publicPage.goto(`${stack.urls.web}/app/p/notes/${slug}`);await imagesLoaded(publicPage)
    await publicPage.screenshot({path:join(directory,'public-images.png')})
    checks.push('Anonymous public Tiptap body and cover render only through published-note route')
    // The exported raster must include the loaded blob images; exercise the
    // same export function as the public toolbar with an actual browser DOM.
    for(const label of ['JPG','PDF']) {
      const downloading=publicPage.waitForEvent('download',{timeout:30000})
      await publicPage.getByRole('button',{name:label,exact:true}).click()
      const download=await downloading,bytes=await readFile(await download.path())
      assert.ok(bytes.length>1000)
      if(label==='PDF')assert.equal(bytes.subarray(0,5).toString(),'%PDF-')
    }
    await publicPage.getByRole('button',{name:'Copiar contenido',exact:true}).click()
    await publicPage.waitForFunction(async()=>{
      const clipboard=await navigator.clipboard.read()
      for(const item of clipboard)if(item.types.includes('text/html'))return (await (await item.getType('text/html')).text()).includes('data:image/png')
      return false
    })
    checks.push('Public JPG/PDF export downloads and rich clipboard embeds authorized image bytes')
    await owner.goto(`${stack.urls.web}/app/m/runly.notes`)
    await owner.waitForFunction(()=>[...document.images].some(image=>image.src.startsWith('blob:')&&image.naturalWidth===64))
    checks.push('Private home-card image preview resolves authorized bytes')
    if(canvasId) {
      const imageRequests=[];owner.on('response',response=>{if(response.url().includes('/media?'))imageRequests.push(response.status())})
      await owner.goto(`${stack.urls.web}/app/m/runly.notes/?note=${canvasId}`)
      for(let i=0;i<40;i++) {
        if(await owner.locator('.excalidraw').count())break
        const card=owner.locator('h3:visible').filter({hasText:'Lienzo historico'}).first()
        if(await card.count())await card.click({timeout:500}).catch(()=>{})
        await owner.waitForTimeout(250)
      }
      await owner.locator('.excalidraw').first().waitFor({timeout:45000})
      await owner.waitForFunction(()=>document.querySelector('.excalidraw canvas'))
      assert.ok(imageRequests.includes(200))
      await owner.screenshot({path:join(directory,'historical-excalidraw.png')})
      checks.push('Full Excalidraw hydrates historical manifest through authorized media route')
      const publicCanvas=await pageFor(null),canvasResponses=[]
      publicCanvas.on('response',response=>{if(response.url().includes('/media?'))canvasResponses.push(response.status())})
      const canvasSlug=await publish(canvasId)
      await publicCanvas.goto(`${stack.urls.web}/app/p/notes/${canvasSlug}`)
      await publicCanvas.locator('.excalidraw').first().waitFor({timeout:45000})
      assert.ok(canvasResponses.includes(200))
      await publicCanvas.screenshot({path:join(directory,'public-excalidraw.png')})
      checks.push('Anonymous published Excalidraw hydrates its referenced image without opening Storage')
    }
    assert.deepEqual(errors,[])
    const result={passed:true,checks,errors};await writeFile(join(directory,'result.json'),JSON.stringify(result,null,2));return result
  } catch(error) {
    for(const[index,context]of contexts.entries())for(const page of context.pages())await page.screenshot({path:join(directory,`failure-${index}.png`)}).catch(()=>{})
    await writeFile(join(directory,'failure.json'),JSON.stringify({message:error.message,checks,errors},null,2));throw error
  } finally{await browser.close();await new Promise(resolve=>web.httpServer.close(resolve))}
}
