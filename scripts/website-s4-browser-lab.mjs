// Only started by the disposable PostgreSQL runner with --browser.
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {dirname,resolve,join} from 'node:path'
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createWebsitePublicationContext} from '../apps/api/src/services/website-publication-context.js'
import {createWebsiteAccess} from '../apps/api/src/services/website-authorization-service.js'
import {createWebsiteContentIsolation} from '../apps/api/src/services/website-content-isolation.js'
import {createWebsitePreviewHandler} from '../apps/api/src/routes/website/preview-routes.js'
import {createWebsiteService} from '../apps/api/src/routes/website/website-service.js'
import {buildWebsitePublicRuntime} from './build-website-public-runtime.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(new URL('../apps/api/package.json',import.meta.url)),desktop=createRequire(new URL('../apps/desktop/package.json',import.meta.url))
const{PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg'),{Hono}=require('hono'),{serve}=require('@hono/node-server'),{build}=require('esbuild'),JSZip=require('jszip')
const marker=process.env.RUNLY_WEBSITE_TEST_DISPOSABLE,url=process.env.RUNLY_WEBSITE_TEST_DATABASE_URL
if(!/^runly-website-test-[a-f0-9-]+$/.test(marker??'')||new URL(url).hostname!=='127.0.0.1'||execFileSync('docker',['port',marker,'5432/tcp'],{encoding:'utf8'}).trim()!==`127.0.0.1:${new URL(url).port}`)throw Error('Disposable runner required')
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})}),folder=await mkdtemp(join(tmpdir(),'runly-s4-browser-'))
const uuid=async()=>(await db.$queryRaw`SELECT uuidv7()::text id`)[0].id
const company=await db.company.create({data:{id:await uuid(),name:'Browser lab',slug:'browser-lab'}}),actor=await db.userProfile.create({data:{id:await uuid(),authUserId:await uuid(),email:'browser@example.test',displayName:'Browser lab'}}),access=createWebsiteAccess({companyId:company.id,actorId:actor.id,can:()=>true}),ctx={companyId:company.id,access}
const blobs=new Map(),storage={async put(key,bytes){if(blobs.has(key)&&!blobs.get(key).equals(bytes))throw Error('overwrite');blobs.set(key,Buffer.from(bytes))},async get(key){if(!blobs.has(key))throw Error('missing');return blobs.get(key)}}
let app=new Hono();const server=serve({fetch:(...a)=>app.fetch(...a),hostname:'127.0.0.1',port:0}),port=await new Promise(res=>server.on('listening',()=>res(server.address().port)))
const isolation=createWebsiteContentIsolation({adminOrigin:`http://127.0.0.1:${port}`,contentRoot:'content.localhost',previewRoot:'preview.localhost',previewProtocol:'http:',previewPort:String(port),localLab:true})
const runtime=await buildWebsitePublicRuntime(),publication=createWebsitePublicationContext({prisma:db,storage,isolation,runtime:async()=>runtime}),svc=createWebsiteService({prisma:db,publicationContext:publication}),site=await svc.createSite({...ctx,data:{name:'Browser lab'}}),page=await svc.createPage({...ctx,siteId:site.id,data:{title:'Lab',slug:'lab',routePath:'/'}}),args={...ctx,siteId:site.id}
const document={schemaVersion:1,id:'lab-document',slug:'/',title:'Browser lab',visibility:'public',regions:{main:{id:'main',children:['hero']}},blocks:{hero:{id:'hero',type:'HeroBlock',props:{title:'S4 historical headline'}}},seo:{},updatedAt:''}
await svc.saveDraft({...ctx,pageId:page.id,builderData:document,expectedRevision:0})
const installedPackage=resolve(dirname(desktop.resolve('@raulbellosom/atlas-web-builder')),'..'),candidate=join(folder,'candidate')
const archive=process.env.RUNLY_WEBSITE_BUILDER_TGZ;if(!archive)throw Error('Candidate tarball required')
if('sha512-'+createHash('sha512').update(await readFile(archive)).digest('base64')!=='sha512-YEg7f9blG0o9Z7gml9EbS1HI4P8iarCmgclc2WSEMlGg72Uo6vuPpWp8qeGblIlU0tWmyQgIcrPJZmqHDqBuSg==')throw Error('Unexpected candidate bytes')
await mkdir(candidate);execFileSync('tar',['-xf',archive,'-C',candidate])
const baseline=join(folder,'baseline');await mkdir(baseline)
const baselineArchive=resolve(root,'.artifacts/website-s4/raulbellosom-atlas-web-builder-0.2.0.tgz')
if('sha512-'+createHash('sha512').update(await readFile(baselineArchive)).digest('base64')!=='sha512-jM23AblG6GVB6TLvGpCeNh+g+Zhg4GIsk2eULpmLWTpJS/HSAM3pON1wNYCOiXgRgY4cP7Gf83YGu/39XxWTxQ==')throw Error('Unexpected baseline bytes')
execFileSync('tar',['-xf',baselineArchive,'-C',baseline])
const bundles={}
for(const[name,pkg]of [['installed',join(baseline,'package')],['candidate',join(candidate,'package')]]){
 const aliases={'@raulbellosom/atlas-web-builder/styles':join(pkg,'dist/style.css'),'@raulbellosom/atlas-web-builder':join(pkg,'dist/atlas-web-builder.js'),'react':desktop.resolve('react'),'react/jsx-runtime':desktop.resolve('react/jsx-runtime'),'react/jsx-dev-runtime':desktop.resolve('react/jsx-dev-runtime'),'react-dom/client':desktop.resolve('react-dom/client'),'react-dom':desktop.resolve('react-dom')}
 const result=await build({absWorkingDir:root,entryPoints:['scripts/fixtures/website-s4/editor-entry.jsx'],bundle:true,write:false,outdir:'lab',format:'esm',platform:'browser',jsx:'automatic',alias:aliases,nodePaths:[resolve(installedPackage,'../..')],define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'}})
 bundles[name]=Object.fromEntries(result.outputFiles.map(f=>[f.path.endsWith('.css')?'css':'js',Buffer.from(f.contents)]))
}
app.use('*',createWebsitePreviewHandler({...publication,prisma:db}))
app.use('/lab/*',async(c,next)=>{if(c.req.header('host')!==`127.0.0.1:${port}`)return c.notFound();return next()})
app.get('/lab/editor/:version',c=>{const name=c.req.param('version');if(!bundles[name])return c.notFound();c.header('Set-Cookie','runly-lab-admin-cookie=synthetic-admin-only; Path=/; HttpOnly; SameSite=Strict');return c.html(`<link rel="stylesheet" href="/lab/bundle/${name}/css"><div id="editor"></div><script type="module" src="/lab/bundle/${name}/js"></script>`)})
app.get('/lab/bundle/:version/:type',c=>{const type=c.req.param('type'),bytes=bundles[c.req.param('version')]?.[type];if(!bytes)return c.notFound();c.header('Content-Type',type==='js'?'text/javascript':'text/css');return c.body(bytes)})
app.get('/lab/state',async c=>{const p=await db.websitePage.findUnique({where:{id:page.id}});return c.json({revision:p.revision,document:p.draftBuilderData})})
for(const op of ['save','publish'])app.post('/lab/'+op,async c=>{try{const b=await c.req.json();const result=op==='save'?await svc.saveDraft({...ctx,pageId:page.id,builderData:b.document,expectedRevision:b.expectedRevision}):await svc.publishPage({...ctx,pageId:page.id,builderData:b.document,expectedRevision:b.expectedRevision,idempotencyKey:`browser-publish-${b.expectedRevision}-attempt`});return c.json({revision:result.revision,title:b.document.blocks.hero?.props.title??'saved'})}catch(e){return c.json({code:e.code??'failed'},e.status??500)}})
const previewLinks=[]
const corpus=resolve(root,'.artifacts/website-s4/corpus')
for(const record of JSON.parse(await readFile(join(corpus,'matrix.json'),'utf8'))){
 const z=new JSZip();async function visit(dir,prefix=''){for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name),name=prefix+item.name;if(item.isDirectory())await visit(path,name+'/');else z.file(name,await readFile(path))}}await visit(join(corpus,record.directory))
 try{const imported=await publication.imports.create({...args,bytes:await z.generateAsync({type:'nodebuffer'}),routingMode:['react','vue','angular'].includes(record.framework)?'spa':'mpa',idempotencyKey:`browser-import-${record.framework}-attempt`}),s=await db.websiteSite.findUnique({where:{id:site.id}}),r=await publication.releases.prepare({...args,kind:'dist',importId:imported.id,baseReleaseId:null,expectedDraftRevision:s.draftRevision,expectedPublicationRevision:0,idempotencyKey:`browser-release-${record.framework}-attempt`}),p=await publication.previews.create({...args,releaseId:r.id});previewLinks.push({framework:record.framework,url:p.url});console.log(record.framework+': READY')}catch(e){previewLinks.push({framework:record.framework,error:e.code??e.message});console.log(record.framework+': '+(e.code??e.message))}
}
let csrfHits=0
app.post('/lab/csrf',c=>{csrfHits++;return c.text('synthetic-admin-only')})
app.get('/lab/security-state',c=>c.json({csrfHits}))
{
 const evil=`<h1>S4 Isolation probe</h1><pre id="result">running</pre><script>(async()=>{const r={cookie:document.cookie,adminStorage:localStorage.getItem('runly-lab-admin-session')};try{await fetch('http://127.0.0.1:${port}/lab/csrf',{method:'POST',credentials:'include'});r.csrf='sent'}catch{r.csrf='blocked'}try{await navigator.serviceWorker.register('/worker.js');r.serviceWorker='registered'}catch{r.serviceWorker='blocked'}r.adminRouteStatus=(await fetch('/auth/session')).status;document.getElementById('result').textContent=JSON.stringify(r)})();</script>`
 const z=new JSZip();z.file('index.html',evil);z.file('worker.js','self.addEventListener("fetch",()=>{})')
 const i=await publication.imports.create({...args,bytes:await z.generateAsync({type:'nodebuffer'}),idempotencyKey:'browser-isolation-import-key'}),s=await db.websiteSite.findUnique({where:{id:site.id}}),r=await publication.releases.prepare({...args,kind:'dist',importId:i.id,expectedDraftRevision:s.draftRevision,expectedPublicationRevision:0,baseReleaseId:null,idempotencyKey:'browser-isolation-release-key'}),p=await publication.previews.create({...args,releaseId:r.id});previewLinks.push({framework:'security',url:p.url})
}
app.get('/lab/',c=>c.html(`<h1>S4 disposable browser lab</h1><a href="/lab/editor/installed">Editor 0.2.0</a><br><a href="/lab/editor/candidate">Editor 0.2.4</a>${previewLinks.map(p=>`<p>${p.error??`<a href="${p.url}">${p.framework} private preview</a>`}</p>`).join('')}`))
app.get('/lab/preview-builder',async c=>{const s=await db.websiteSite.findUnique({where:{id:site.id}}),p=await publication.previews.create({...args,expectedDraftRevision:s.draftRevision,expectedPublicationRevision:s.publicationRevision,baseReleaseId:s.activeReleaseId,changes:{publishPageIds:[page.id]}});return c.redirect(p.url)})
app.post('/lab/previews',async c=>{
 if(c.req.header('origin')!==`http://127.0.0.1:${port}`)return c.notFound()
 const links=[]
 for(const item of previewLinks){if(item.error){links.push(item);continue}const old=await db.websitePreviewSession.findUnique({where:{hostname:new URL(item.url).hostname}});if(!old||old.companyId!==company.id)throw Error('Invalid fixture owner');links.push({framework:item.framework,...await publication.previews.create({...args,releaseId:old.releaseId})})}
 return c.json(links)
})
app.get('/lab/stop',c=>{setTimeout(()=>{server.close();db.$disconnect().then(()=>process.exit(0))},100);return c.text('Disposable lab stopped')})
await mkdir(resolve(root,'.artifacts/website-s4'),{recursive:true});await writeFile(resolve(root,'.artifacts/website-s4/browser-lab.json'),JSON.stringify({url:`http://127.0.0.1:${port}/lab/`,previews:previewLinks},null,2))
console.log(`BROWSER LAB READY: http://127.0.0.1:${port}/lab/`)
