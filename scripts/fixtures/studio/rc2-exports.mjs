import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {chromium} from 'playwright'
import {blankDocument,appendObject} from '../../../apps/shared/studio/document.js'
import {commitStudioMcpUpdate} from './operations-mcp.mjs'
const sharp=createRequire(new URL('../../../apps/api/package.json',import.meta.url))('sharp')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

export async function verifyRc2Exports(stack,{users,companies}){
  const [owner,,peer]=users,[company]=companies,checks=[],outputs=[],contexts=[]
  const tokens=await Promise.all([owner,peer].map(async user=>{const r=await fetch(stack.urls.api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})});assert.equal(r.status,200);return(await r.json()).data.access_token}))
  const api=(path,data,actor=0,method=data?'POST':'GET')=>fetch(stack.urls.api+path,{method,headers:{Authorization:`Bearer ${tokens[actor]}`,'X-Runly-Company-Id':company.id,'X-Runly-Studio-Protocol':'2',...(data&&!(data instanceof FormData)?{'Content-Type':'application/json'}:{})},body:data?(data instanceof FormData?data:JSON.stringify(data)):undefined})
  const json=async r=>{const b=await r.json();assert.ok(r.ok,`${r.status}: ${JSON.stringify(b)}`);return b.data}
  const image=await sharp({create:{width:100,height:60,channels:4,background:'#f59e0b'}}).png().toBuffer(),form=new FormData();form.set('file',new File([image],'synthetic.png',{type:'image/png'}));form.set('moduleKey','runly.files');form.set('entityType','AtlasFile')
  const file=await json(await api('/files/upload',form))
  let doc=appendObject(blankDocument(600,400),'rectangle',{id:'paint',x:40,y:40,width:120,height:80,groupId:'g',opacity:0.5,fillPaint:{type:'gradient',gradientType:'linear',angle:40,stops:[{offset:0,color:'#ff0000',opacity:0.5},{offset:1,color:'#ff0000',opacity:0.5}]}})
  doc=appendObject(doc,'image',{id:'photo',x:250,y:40,width:120,height:120,groupId:'g',fileAssetId:file.id,image:{mask:'star'}})
  doc=appendObject(doc,'text',{id:'text',x:40,y:200,width:300,height:60,text:'Studio RC2',fontFamily:'Lato',fontVariant:'bold',fontSize:32,fill:'#111111'})
  doc=appendObject(doc,'rectangle',{id:'outside',x:-20,y:300,width:40,height:60,fill:'#123456'})
  const record=await json(await api('/studio/designs',{name:'RC2 synthetic export',document:doc})),root=`/studio/designs/${record.id}`
  await json(await api(root+'/collaborators',{userId:peer.id,role:'VIEWER'},0,'PUT'))
  const browser=await chromium.launch({channel:'chrome',headless:true})
  async function open(user){const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage();page.setDefaultTimeout(10000);contexts.push(context);page.on('dialog',d=>d.accept());await page.goto(stack.urls.web+'/app/login');await page.locator('#identifier').fill(user.email);await page.locator('#password').fill(user.password);await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(u=>!u.pathname.includes('/login'));await page.goto(stack.urls.web+`/app/m/runly.studio/?design=${record.id}`);await page.locator('.upper-canvas').waitFor();return page}
  async function prepare(page,{type='PNG',scale=1,transparent=false,profile='rgb'}={}){
    await page.getByRole('button',{name:'Descargar',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Descargar',exact:true});await dialog.getByRole('radio',{name:new RegExp(`^${type}`)}).click()
    if(type!=='PDF'){await dialog.getByRole('radio',{name:`×${scale}`,exact:true}).click();if(type==='PNG')await dialog.getByRole('checkbox',{name:'Fondo transparente',exact:true}).setChecked(transparent)}
    else{await dialog.getByRole('radio',{name:profile==='cmyk'?/CMYK/:/RGB/}).click();await dialog.getByRole('checkbox',{name:'Sangrado de 3 mm',exact:true}).check();await dialog.getByRole('checkbox',{name:'Marcas de corte',exact:true}).check()}
    await dialog.getByRole('button',{name:'Descargar',exact:true}).click()
    await page.getByRole('button',{name:`Exportar ${type}`,exact:true}).click()
  }
  async function download(page,options,path){const pending=page.waitForEvent('download',{timeout:45000}).catch(error=>({error}));await prepare(page,options);const result=await pending;if(result.error)throw result.error;await result.saveAs(path);return readFile(path)}
  try{
    const a=await open(owner),b=await open(peer)
    for(const scale of [1,2,3])for(const type of ['PNG','JPG']){
      const path=join(stack.directory,`rc2-${type.toLowerCase()}-${scale}.${type.toLowerCase()}`),buffer=await download(b,{type,scale,transparent:type==='PNG'},path)
      const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,600*scale);assert.equal(info.height,400*scale)
      const pixel=(x,y)=>[...data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4)],clear=pixel(570*scale,20*scale),alpha=pixel(80*scale,80*scale)
      if(type==='PNG'){assert.equal(clear[3],0);assert.ok(Math.abs(alpha[3]-64)<=1)}else{assert.equal(clear[3],255);assert.ok(clear.slice(0,3).every(v=>v>=250));assert.equal((await sharp(buffer).metadata()).format,'jpeg')}
      outputs.push({type,scale,width:info.width,height:info.height,bytes:buffer.length,path:path.split(/[\\/]/).at(-1)})
    }
    checks.push('Reader exports real PNG/JPG x1/x2/x3; decoded exact dimensions/alpha/pixels, groups, local font, masked original, off-page crop')
    for(const profile of ['rgb','cmyk']){const path=join(stack.directory,`rc2-print-${profile}.pdf`),buffer=await download(b,{type:'PDF',profile},path);assert.ok(buffer.subarray(0,5).equals(Buffer.from('%PDF-')));outputs.push({type:'PDF',profile,bytes:buffer.length,path:path.split(/[\\/]/).at(-1)})}
    checks.push('Authorized reader obtains real 300 ppi RGB/DeviceCMYK PDF with bleed/crop marks; artifacts retained for independent rasterization')
    async function concurrent(action,label){
      let release,started;const held=new Promise(r=>{release=r}),seen=new Promise(r=>{started=r});let intercepted=false,downloads=0
      const onDownload=()=>{downloads++};b.on('download',onDownload)
      await b.route('**/storage/v1/object/sign/**',async route=>{if(!intercepted){intercepted=true;started();await held}await route.continue()})
      await prepare(b,{type:'PNG'});await Promise.race([seen,sleep(15000).then(()=>{throw Error('Export original was not reauthorized')})])
      try{await action()}finally{release()}await sleep(1200);await b.unroute('**/storage/v1/object/sign/**');b.off('download',onDownload);assert.equal(downloads,0,label)
    }
    await concurrent(async()=>{await json(await api(root+'/changes',{clientId:'rc2-concurrent-owner',batchId:1,ops:[{type:'patch',id:'paint',set:{x:55}}]}))},'Concurrent A update must reject stale export')
    checks.push('A edits while B exports: stale revision is rejected; no mixed-state file is downloaded')
    await b.reload();await b.locator('.upper-canvas').waitFor()
    await concurrent(async()=>{const current=await json(await api(root));await commitStudioMcpUpdate(stack,{token:tokens[0],companyId:company.id,designId:record.id,name:current.name,revision:current.revision,document:{...current.document,objects:current.document.objects.map(o=>o.id==='text'?{...o,text:'MCP during export'}:o)}})},'MCP update must reject stale export')
    checks.push('MCP update during rendering coexists with the open editor and rejects stale export after commit')
    await b.reload();await b.locator('.upper-canvas').waitFor()
    await concurrent(async()=>json(await api(root+'/collaborators',{userId:peer.id,role:null},0,'PUT')),'Revoked reader must not download private image')
    assert.equal((await api(root,null,1)).status,404)
    checks.push('Revocation during original-image refresh blocks final download; read-only role was permitted before revocation')
    await a.screenshot({path:join(stack.directory,'rc2-export-owner.png')})
    return {checks,outputs,designId:record.id}
  }catch(error){for(const context of contexts)for(const page of context.pages()){await page.screenshot({path:join(stack.directory,`rc2-export-failure-${contexts.indexOf(context)}.png`)}).catch(()=>{});console.log((await page.locator('body').innerText()).slice(-2200))}throw error}
  finally{await browser.close()}
}
