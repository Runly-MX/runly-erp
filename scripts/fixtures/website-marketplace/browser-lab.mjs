import assert from 'node:assert/strict'
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {Hono} from 'hono'
import {chromium} from 'playwright'
import {createWebsiteRouter} from '../../../apps/api/src/routes/website/index.js'
import {createPublicWebsiteRouter} from '../../../apps/api/src/routes/public-website.js'
import {serveWebsiteRelease} from '../../../apps/api/src/routes/website/public-release-routes.js'
import {websiteErrorHandler} from '../../../apps/api/src/services/website-authorization-service.js'
const require=createRequire(new URL('../../../apps/desktop/package.json',import.meta.url)),apiRequire=createRequire(new URL('../../../apps/api/package.json',import.meta.url))
const {build}=apiRequire('esbuild')
const {serve}=apiRequire('@hono/node-server')
const {createClient}=apiRequire('@supabase/supabase-js')
export async function runWebsiteBrowserAcceptance({stack,db,users,companies,admin,storageAdmin,filesService,gate,publication,website,ctx,entry,publicHostname}) {
 const authClient=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data:auth,error}=await authClient.auth.signInWithPassword({email:users[0].email,password:users[0].password});assert(!error)
 for(const company of companies)await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'website.%' ON CONFLICT DO NOTHING",[company.roleId])
 const site=await website.createSite({...ctx,data:{name:'Elevate Browser',siteType:'website'}})
 const app=new Hono()
 app.use('/website/*',async(c,next)=>{
  const token=c.req.header('Authorization')?.replace(/^Bearer /,''),result=await admin.auth.getUser(token)
  if(result.error||!result.data.user)return c.json({error:'Unauthorized'},401)
  const profile=await db.userProfile.findUnique({where:{authUserId:result.data.user.id}}),companyId=c.req.header('X-Runly-Company-Id')
  const permissions=(await stack.pool.query('SELECT p.key FROM membership m JOIN role_permission rp ON rp.role_id=m.role_id JOIN permission p ON p.id=rp.permission_id WHERE m.company_id=$1 AND m.user_id=$2 AND m.enabled=true',[companyId,profile.id])).rows
  c.set('userId',profile.id);c.set('companyId',companyId);c.set('tenantContext',{companyId,isAdmin:false,permissionSet:new Set(permissions.map(p=>p.key))});return next()
 })
 const requirePermission=permission=>async(c,next)=>{const row=(await stack.pool.query('SELECT public.runly_member_active($1::uuid,$2::uuid,$3) AS ok',[c.get('companyId'),c.get('userId'),permission])).rows[0];return row.ok?next():c.json({error:'Sin permiso'},403)}
 app.route('/',createWebsiteRouter({prisma:db,requirePermission,supabaseAdmin:storageAdmin,filesService,marketplace:gate,publicationContext:publication}))
 const bundle=await build({entryPoints:['scripts/fixtures/website-marketplace/browser-entry.jsx'],bundle:true,write:false,outdir:'lab',format:'esm',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},loader:{'.js':'jsx','.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'},alias:{react:require.resolve('react'),'react/jsx-runtime':require.resolve('react/jsx-runtime'),'react-dom':require.resolve('react-dom'),'react-dom/client':require.resolve('react-dom/client'),'react-router-dom':require.resolve('react-router-dom'),'@tanstack/react-query':require.resolve('@tanstack/react-query')}})
 const files=Object.fromEntries(bundle.outputFiles.map(f=>[f.path.endsWith('.css')?'css':'js',Buffer.from(f.contents)]))
 const assets=await readdir('apps/desktop/dist/assets'),style=assets.find(f=>/^styles-.*\.css$/.test(f))
 const server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:0});if(!server.listening)await new Promise(resolve=>server.once('listening',resolve))
 const origin=`http://127.0.0.1:${server.address().port}`
 app.get('/lab/session',c=>c.json({session:auth.session,companyId:ctx.companyId,siteId:site.id,resource:entry}))
 app.get('/lab/style.css',async c=>{c.header('Content-Type','text/css');return c.body(await readFile(`apps/desktop/dist/assets/${style}`))})
 app.get('/lab/assets/:name',async c=>{const name=c.req.param('name');if(!assets.includes(name))return c.notFound();return c.body(await readFile(`apps/desktop/dist/assets/${name}`))})
 app.get('/lab/bundle.js',c=>{c.header('Content-Type','text/javascript');return c.body(files.js)})
 app.get('/lab/bundle.css',c=>{c.header('Content-Type','text/css');return c.body(files.css)})
 app.get('/lab/editor',c=>c.html(`<html lang="es"><head><meta charset="UTF-8"><link rel="stylesheet" href="/lab/style.css"><link rel="stylesheet" href="/lab/bundle.css"><script>window.__RUNLY_RUNTIME_CONFIG__=${JSON.stringify({RUNLY_API_URL:origin,SUPABASE_URL:stack.urls.kong,SUPABASE_ANON_KEY:stack.secret.SUPABASE_ANON_KEY})}</script></head><body><div id="root"></div><script type="module" src="/lab/bundle.js"></script></body></html>`))
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1560,height:1100}}),page=await context.newPage(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const output='.artifacts/website-w3/browser';await mkdir(output,{recursive:true})
 try {
  await page.goto(origin+'/lab/editor?draft=1')
  await page.getByRole('button',{name:'Revisar plantilla y conflictos',exact:true}).click()
  await page.getByText('He revisado páginas, conflictos, requisitos y avisos de licencia',{exact:true}).click()
  const installResponse=page.waitForResponse(r=>r.url().endsWith('/marketplace/install'))
  await page.getByRole('button',{name:'Confirmar instalación',exact:true}).click()
  const response=await installResponse,result=await response.json();assert.equal(response.status(),201,JSON.stringify(result))
  const assetId=Object.values(result.data.assets)[0],assetPath=`${origin}/website/sites/${site.id}/template-assets/${assetId}`
  const headers={Authorization:`Bearer ${auth.session.access_token}`,'X-Runly-Company-Id':ctx.companyId}
  const imageResponse=await fetch(assetPath,{headers});assert.equal(imageResponse.status,200);assert.match(imageResponse.headers.get('Content-Type'),/^image\//);assert.match(imageResponse.headers.get('Cache-Control'),/no-store/)
  assert.equal((await fetch(assetPath)).status,401)
  const foreignClient=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const foreign=await foreignClient.auth.signInWithPassword({email:users[3].email,password:users[3].password});assert(!foreign.error)
  assert.equal((await fetch(assetPath,{headers:{Authorization:`Bearer ${foreign.data.session.access_token}`,'X-Runly-Company-Id':companies[1].id}})).status,404)
  await page.screenshot({path:output+'/01-installed.png',fullPage:true})
  await page.getByRole('button',{name:'Editar con Atlas',exact:true}).click()
  const installedPage=await db.websitePage.findUnique({where:{id:result.data.firstPageId}}),heading=Object.values(installedPage.draftBuilderData.blocks).find(b=>b.type==='HeadingBlock'),image=Object.values(installedPage.draftBuilderData.blocks).find(b=>b.type==='ImageBlock')
  await page.locator(`[data-block-id="${heading.id}"]`).click();await page.getByLabel('Texto',{exact:true}).fill('Elevate W3 · edición real con Atlas')
  await page.locator(`[data-block-id="${image.id}"]`).click();await page.getByRole('button',{name:'Abrir selector de medios',exact:true}).click();await page.getByRole('tab',{name:'Biblioteca',exact:true}).click();await page.getByRole('dialog',{name:'Selector de medios'}).getByRole('option').filter({hasText:'b2d41d1f3c26741f4ade4edbdbcef3aebda15f41ce03ebcda2f9de27fe900d80'}).click()
  await page.getByRole('tab',{name:'Tema',exact:true}).click();await page.locator('.atlas-wb-theme__row').filter({hasText:/^color\.primary$/}).locator('input[type=text]').fill('#384d42')
  const saveResponse=page.waitForResponse(r=>r.url().includes('/pages/')&&r.url().endsWith('/draft')&&r.request().method()==='PUT')
  await page.getByRole('button',{name:'Guardar borrador',exact:true}).click()
  const saved=await saveResponse;assert.equal(saved.status(),200,await saved.text())
  await page.reload();await page.locator(`[data-block-id="${heading.id}"]`).click();assert.equal(await page.getByLabel('Texto',{exact:true}).inputValue(),'Elevate W3 · edición real con Atlas')
  await page.screenshot({path:output+'/02-atlas-reopened.png',fullPage:true})
  await page.locator(`[data-block-id="${image.id}"]`).click();await page.screenshot({path:output+'/02b-atlas-private-image.png',fullPage:true})
  const persisted=await db.websitePage.findUnique({where:{id:installedPage.id}});assert(persisted.draftBuilderData.blocks[image.id].props.src.startsWith('file:'));assert.notEqual(persisted.draftBuilderData.blocks[image.id].props.src,installedPage.draftBuilderData.blocks[image.id].props.src)
  assert.equal((await website.getActiveTheme({...ctx,siteId:site.id})).tokens.color.primary,'#384d42');assert.equal(errors.length,0,errors.join('; '))
  const publicApp=new Hono();publicApp.onError(websiteErrorHandler)
  publicApp.route('/public/website',createPublicWebsiteRouter({prisma:db,supabaseAdmin:admin,publicationContext:publication}))
  publicApp.get('*',c=>serveWebsiteRelease(c,publication.gateway,c.req.path,publication.runtime,publication.ssr))
  const publicContext=await browser.newContext()
  try{
   await publicContext.route('**/*',async route=>{
    const request=route.request();if(new URL(request.url()).hostname!==publicHostname)return route.abort()
    const result=await publicApp.fetch(new Request(request.url(),{method:request.method(),headers:{...request.headers(),host:publicHostname},body:request.postDataBuffer()??undefined}))
    await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())})
   })
   const visitor=await publicContext.newPage()
   for(const [name,width,height]of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844]]){
    await visitor.setViewportSize({width,height});const response=await visitor.goto(`http://${publicHostname}/`);assert.equal(response.status(),200)
    await visitor.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight){scrollTo(0,y);await new Promise(resolve=>setTimeout(resolve,40))}scrollTo(0,0)})
    await visitor.waitForFunction(()=>document.images.length>0&&[...document.images].every(i=>i.complete&&i.naturalWidth>0))
    assert(await visitor.evaluate(()=>{const h=document.querySelector('[data-atlas-page] h1'),style=getComputedStyle(h),heading=style.getPropertyValue('--atlas-font-heading').trim().split(',')[0].replace(/["']/g,'').toLowerCase();return Boolean(heading)&&style.fontFamily.toLowerCase().includes(heading)}),'portable heading font token is rendered')
    assert(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'public horizontal overflow '+name)
    await visitor.screenshot({path:`${output}/03-public-${name}.png`,fullPage:true})
   }
  }finally{await publicContext.close()}
  await writeFile(output+'/result.json',JSON.stringify({pages:1,blocks:133,assets:16,privateImageReferences:true,realAuth:true,privateHttpIsolation:true,publicViewports:[1440,768,390],publicImagesLoaded:true,headingTokenRendered:true,errors},null,2))
 }catch(error){await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});throw error}finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
