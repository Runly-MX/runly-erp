import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {registerHooks,createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import net from 'node:net'
import pg from 'pg'
const config=JSON.parse(await readFile(resolve('.artifacts/website-integration/private.json'),'utf8'))
if(!/^runly-studio-e2e-[a-f0-9]+$/.test(config.name)||!config.env.DATABASE_URL.includes(`@127.0.0.1:${config.ports.db}/`))throw Error('UNVERIFIED_LAB')
const guard=new pg.Pool({connectionString:config.env.DATABASE_URL})
try {if((await guard.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id!==config.name)throw Error('LAB_MARKER_MISMATCH')}
finally {await guard.end()}
Object.assign(process.env,config.env)
if(process.argv.includes('--web')){
  const requireDesktop=createRequire(new URL('../../apps/desktop/package.json',import.meta.url))
  const child=spawn(process.execPath,[resolve(requireDesktop.resolve('vite/package.json'),'../bin/vite.js'),'--host','127.0.0.1','--port',String(config.ports.web),'--strictPort'],{
    cwd:resolve('apps/desktop'),env:{...config.env,VITE_RUNLY_API_URL:config.urls.api,VITE_SUPABASE_URL:config.urls.kong,VITE_SUPABASE_ANON_KEY:config.env.SUPABASE_ANON_KEY},stdio:'inherit'})
  child.on('exit',code=>process.exit(code??1))
}else{
  // Reject unexpected outgoing sockets, including local shared services.
  const original=net.Socket.prototype.connect
  net.Socket.prototype.connect=function(...args){
    const normalized=Array.isArray(args[0])?args[0]:net._normalizeArgs(args),options=normalized[0]
    if(options.path||!['127.0.0.1','localhost','::1'].includes(options.host??'localhost')||!Object.values(config.ports).includes(Number(options.port))){console.error('Rejected lab socket', options.host, options.port, Boolean(options.path));throw Error('LAB_NETWORK_TARGET_REJECTED')}
    return original.apply(this,args)
  }
  // Trusted test composition only: changes the constructor's installation options,
  // never routes, authentication, authorization, storage or response bodies.
  registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith('/services/website-publication-context.js'))return {...result,source:String(result.source).replace(' const storage=',' options={...globalThis.__websiteIntegrationOptions,...options};\n const storage=')};return result}})
  const {createWebsiteContentIsolation}=await import('../../apps/api/src/services/website-content-isolation.js')
  const isolation=createWebsiteContentIsolation({adminOrigin:config.urls.web,contentRoot:'content.localhost',previewRoot:'preview.localhost',previewProtocol:'http:',previewPort:String(config.ports.api),localLab:true})
  globalThis.__websiteIntegrationOptions={isolation}
  const {app}=await import('../../apps/api/src/index.js')
  const {serve}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('@hono/node-server')
  serve({port:config.ports.api,hostname:'127.0.0.1',fetch(request){
    const url=new URL(request.url)
    if(url.hostname.endsWith('.localhost')&&!url.hostname.endsWith('.preview.localhost')&&!url.pathname.startsWith('/public/')){
      url.pathname='/public/site'+url.pathname
      request=new Request(url,request)
    }
    return app.fetch(request)
  }})
  console.log('Full API listening on disposable loopback port')
}
