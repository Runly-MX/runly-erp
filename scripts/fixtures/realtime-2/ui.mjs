import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

export async function verifyRealtimeUi(stack,{actors,company,conversation}) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,stack.name)
  const directory=join(stack.directory,'realtime-ui'),errors=[],checks=[]
  await mkdir(directory,{recursive:true})
  const api=async(path,body,actor=0,method=body?'POST':'GET')=>{
    const response=await fetch(stack.urls.api+path,{method,headers:{Authorization:`Bearer ${actors[actor].session.access_token}`,'X-Runly-Company-Id':company.id,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
    const result=await response.json();assert.ok(response.ok,`UI fixture API rejected ${path}: ${response.status}`);return result.data??result
  }
  const board=await api('/canvas/boards',{name:'Validación visual',templateType:'blank'})
  await api(`/canvas/boards/${board.id}/collaborators`,{userId:actors[1].id,role:'EDITOR'})
  const created=await api('/notes',{title:'Nota visual',content:'<p>Inicial</p>'})
  const note=created.note??created
  await api(`/notes/${note.id}/shares`,{targetUserId:actors[1].id,permission:'edit'})
  for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key]
  const require=createRequire(resolve('apps/desktop/package.json'))
  const {build,preview}=await import(pathToFileURL(require.resolve('vite')).href)
  const config={root:resolve('apps/desktop'),configFile:resolve('apps/desktop/vite.config.js'),envDir:directory,base:'/',
    define:{'import.meta.env.VITE_RUNLY_API_URL':JSON.stringify(stack.urls.api),'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(stack.urls.kong),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(stack.secret.SUPABASE_ANON_KEY)},
    build:{outDir:join(directory,'web'),emptyOutDir:true},preview:{host:'127.0.0.1',port:stack.ports.web,strictPort:true}}
  await build(config)
  const web=await preview(config),browser=await chromium.launch({channel:'chrome',headless:true}),contexts=[]
  async function open(actor) {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context)
    await context.route('**/*',route=>{
      const url=new URL(route.request().url())
      return /^https?:$/.test(url.protocol)&&!['127.0.0.1','localhost'].includes(url.hostname)?route.abort():route.continue()
    })
    await context.addInitScript(id=>localStorage.setItem('runly-active-company',id),company.id)
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
    await page.goto(stack.urls.web+'/app/login')
    await page.locator('#identifier').fill(actors[actor].email)
    await page.locator('#password').fill(actors[actor].password)
    await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click()
    await page.waitForURL(url=>!url.pathname.includes('/login'),{timeout:30000})
    return page
  }
  const until=async(check,label)=>{for(let i=0;i<100;i++){if(await check())return;await wait(150)}throw Error(`UI_TIMEOUT: ${label}`)}
  try {
    const owner=await open(0),peer=await open(1)
    const boardPath=`/app/m/runly.canvas/${board.id}`
    await Promise.all([owner,peer].map(page=>page.goto(stack.urls.web+boardPath)))
    const canvas=page=>page.getByRole('application',{name:/Lienzo del Board/})
    await Promise.all([owner,peer].map(page=>canvas(page).waitFor({timeout:45000})))
    await wait(11000)
    const before=await canvas(peer).evaluate(element=>element.toDataURL())
    const box=await canvas(owner).boundingBox();assert.ok(box.width>100&&box.height>100)
    await owner.mouse.move(box.x+box.width/2,box.y+box.height/2)
    await peer.waitForFunction(before=>document.querySelector('canvas[role="application"]').toDataURL()!==before,before,{timeout:10000})
    await peer.screenshot({path:join(directory,'canvas-cursor.png')})
    checks.push('Full Board/viewport paints a remote authenticated cursor')
    const draw=async(page,offset)=>{
      const target=canvas(page),rect=await target.boundingBox()
      await target.focus();await target.press('r')
      await page.mouse.move(rect.x+150+offset,rect.y+150);await page.mouse.down()
      await page.mouse.move(rect.x+240+offset,rect.y+220,{steps:5});await page.mouse.up()
    }
    await Promise.all([draw(owner,0),draw(peer,200)])
    const objects=()=>api(`/canvas/boards/${board.id}/objects`)
    await until(async()=>(await objects()).length===2,'two canvas creations')
    await canvas(owner).focus();await owner.keyboard.press('Control+z')
    await until(async()=>(await objects()).length===1,'canvas undo')
    await owner.keyboard.press('Control+Shift+z')
    await until(async()=>(await objects()).length===2,'canvas redo')
    checks.push('Two full editors create objects; undo/redo preserves the peer object')

    const notePath=`/app/m/runly.notes/?note=${note.id}`
    await Promise.all([owner,peer].map(page=>page.goto(stack.urls.web+notePath)))
    // The deep link itself opens the note (no list card to tap): this click only worked while ?note= was being dropped.
    const editor=page=>page.locator('.ProseMirror[contenteditable="true"]:visible').first()
    await Promise.all([owner,peer].map(page=>editor(page).waitFor({timeout:45000})))
    await editor(owner).fill('Contenido realtime verificado')
    await until(async()=>(await editor(peer).innerText()).includes('Contenido realtime verificado'),'Tiptap remote edit')
    await wait(2200);await owner.reload()
    await editor(owner).waitFor({timeout:30000})
    await until(async()=>(await editor(owner).innerText()).includes('Contenido realtime verificado'),'Tiptap persisted reopen')
    await owner.screenshot({path:join(directory,'notes-reopened.png')})
    checks.push('Full Tiptap shared edit, autosave and page reload retain content')

    const chatPath=`/app/m/runly.chat/chat/inbox/${conversation.id}`
    await Promise.all([owner,peer].map(page=>page.goto(stack.urls.web+chatPath)))
    const composer=owner.getByPlaceholder('Escribe un mensaje...').first()
    await composer.waitFor({timeout:30000});await composer.fill('Mensaje visual verificado');await composer.press('Enter')
    await peer.getByText('Mensaje visual verificado',{exact:true}).first().waitFor({timeout:20000})
    await peer.screenshot({path:join(directory,'chat-received.png')})
    checks.push('Full Chat composer sends through its mutation hook; peer renders the confirmed message')
    assert.deepEqual(errors,[])
    const result={passed:true,checks,errors};await writeFile(join(directory,'result.json'),JSON.stringify(result,null,2));return result
  } catch(error) {
    for(const [index,context]of contexts.entries())for(const page of context.pages())await page.screenshot({path:join(directory,`failure-${index}.png`)}).catch(()=>{})
    await writeFile(join(directory,'failure.json'),JSON.stringify({message:error.message,errors},null,2))
    throw error
  } finally {
    await browser.close();await new Promise(resolve=>web.httpServer.close(resolve))
  }
}
