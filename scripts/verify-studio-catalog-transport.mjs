import assert from 'node:assert/strict'
import {mkdir,readFile,copyFile,writeFile}from'node:fs/promises'
import {resolve,join}from'node:path'
import {randomBytes}from'node:crypto'
import {execFileSync}from'node:child_process'
import https from'node:https'
import {command}from'./fixtures/studio/supabase-stack.mjs'
import {createCatalogNetwork}from'../apps/api/src/routes/studio/catalog/network.js'
import {createStudioCatalog}from'../apps/api/src/routes/studio/catalog/service.js'

const endpoint=await command('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'])
if(!/^(npipe:|unix:)/.test(endpoint))throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
const {images}=JSON.parse(await readFile('.artifacts/studio/delete-catalog-build.json','utf8'))
const name=`runly-catalog-tls-${randomBytes(6).toString('hex')}`,directory=resolve('.artifacts/studio',name)
await mkdir(directory,{recursive:true})
const openssl=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl'
execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=api.iconify.design','-addext','subjectAltName=DNS:api.iconify.design,DNS:api.openverse.org,DNS:upload.wikimedia.org'],{stdio:'ignore'})
await copyFile('scripts/fixtures/studio/catalog-tls-server.mjs',join(directory,'server.mjs'))
try{
  await command('docker',['run','-d','--name',name,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','-p','127.0.0.1::4443','-p','127.0.0.1::4444','--mount',`type=bind,source=${directory},target=/fixture,readonly`,'--entrypoint','node',images.api,'/fixture/server.mjs'])
  const [container]=JSON.parse(await command('docker',['inspect',name]))
  assert.equal(container.Config.Labels?.['com.docker.compose.project'],undefined)
  const port=Number(container.NetworkSettings.Ports['4443/tcp'][0].HostPort),stalledPort=Number(container.NetworkSettings.Ports['4444/tcp'][0].HostPort)
  for(let i=0;i<30;i++){if((await command('docker',['logs',name])).includes('CATALOG_TLS_READY'))break;await new Promise(resolve=>setTimeout(resolve,100))}
  const ca=await readFile(join(directory,'cert.pem')),a={address:'203.0.113.7',family:4},b={address:'203.0.113.8',family:4},events=[]
  const network=({trusted=true,fallback=false,lookup=async()=>fallback?[a,b]:[b]}={})=>{
    let attempts=0
    return createCatalogNetwork({lookup,addressAllowed:address=>[a.address,b.address].includes(address),timeoutMs:1000,stageTimeouts:{CONNECT:100,TLS:100,HEADERS:100,DOWNLOAD:100},observe:event=>events.push(event),transport:(url,options,callback)=>
      https.request(url,{...options,family:4,port:fallback&&attempts++===0?stalledPort:port,lookup:(_host,_opts,callback)=>queueMicrotask(()=>callback(null,'127.0.0.1',4)),...(trusted?{ca}:{})},callback)
    })
  }
  assert.equal((await network().get('https://api.iconify.design/ok')).bytes.toString(),'{"ok":true}')
  assert.equal((await network({fallback:true}).get('https://api.iconify.design/ok')).bytes.toString(),'{"ok":true}')
  await assert.rejects(network({trusted:false}).get('https://api.iconify.design/ok'),{code:'CATALOG_TLS_FAILED'})
  for(const[path,code,status]of [['slow-headers','CATALOG_HEADERS_TIMEOUT',504],['slow-body','CATALOG_DOWNLOAD_TIMEOUT',504],['malicious','CATALOG_ORIGIN_DENIED',403],['huge','CATALOG_SIZE_LIMIT',413],['status/429','CATALOG_UPSTREAM_429',429],['status/502','CATALOG_UPSTREAM_502',502],['status/504','CATALOG_UPSTREAM_504',502]])await assert.rejects(network().get(`https://api.iconify.design/${path}`),{code,status})
  const service=createStudioCatalog({prisma:{},access:{member:async()=>{}},network:network()})
  assert.equal((await service.search('company','actor','iconify',{q:'intermittent'})).data.length,1)
  await assert.rejects(service.search('company','actor','iconify',{q:'malformed'}),{code:'CATALOG_RESPONSE_INVALID'})
  const timings=events.filter(event=>event.stage==='COMPLETE').map(event=>event.elapsedMs)
  await writeFile(join(directory,'transport-result.json'),JSON.stringify({passed:true,timings,checks:['TLS verified','TLS stalled first address fallback','invalid CA rejected','header/download timeout','malicious redirect','size limit','upstream 429/502/504','bounded transient retry','malformed JSON']},null,2))
  console.log(`Controlled Docker HTTPS transport PASS (${timings.length} complete requests)`)
}finally{await command('docker',['rm','-f',name]).catch(()=>{})}
