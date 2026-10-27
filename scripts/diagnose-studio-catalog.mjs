// Read-only public probes. Never loads .env, contacts PostgreSQL or prints URLs,
// request headers, response bodies, credentials or signed asset capabilities.
import dns from 'node:dns/promises'
import https from 'node:https'
import { createCatalogNetwork, publicCatalogAddress } from '../apps/api/src/routes/studio/catalog/network.js'

const probes = [
  ['iconify','https://api.iconify.design/search?query=house&prefix=tabler&limit=2'],
  ['openverse-photo','https://api.openverse.org/v1/images/?q=tree&page_size=1&category=photograph'],
  ['openverse-illustration','https://api.openverse.org/v1/images/?q=tree&page_size=1&category=illustration'],
  ['wikimedia-original','https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png'],
  ['flickr-origin','https://live.staticflickr.com/'],
]
const families = process.argv.includes('--families') ? [4,6] : [0]
console.log(JSON.stringify({runtime:process.version,probe:'studio-catalog',readOnly:true,proxyEnvironmentPresent:Boolean(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)}))
for(const [label,url] of probes) for(const family of families) {
  const start=performance.now(),events=[];let stage='dns'
  const record=(name,details={})=>{stage=name;if(events.length<20)events.push({stage:name,ms:Math.round(performance.now()-start),...details})}
  const network=createCatalogNetwork({timeoutMs:8000,
    lookup:async(host,options)=>{
      record('dns-start')
      const rows=await dns.lookup(host,options)
      if(!rows.every(row=>publicCatalogAddress(row.address)))throw Error('DNS_DENIED')
      record('dns-end',{answers:rows.map(({address,family})=>({address,family}))})
      return family?rows.filter(row=>row.family===family):rows
    },
    transport:(target,options,callback)=>{
      const request=https.request(target,options,response=>{record('first-byte',{httpStatus:response.statusCode});callback(response)})
      request.on('socket',socket=>{
        record('connect-start')
        socket.once('connect',()=>record('tcp-connected',{family:socket.remoteFamily,address:socket.remoteAddress}))
        socket.once('secureConnect',()=>record('tls-established',{certificateValid:socket.authorized,sni:target.hostname}))
      })
      request.on('error',error=>record('socket-error',{code:error.code??'UNKNOWN'}))
      return request
    },
  })
  try {
    const response=await network.get(url,{maxBytes:262144})
    record('complete',{bytes:response.bytes.length,mime:response.mime})
    console.log(JSON.stringify({label,requestedFamily:family||'auto',ok:true,elapsedMs:Math.round(performance.now()-start),events}))
  }catch(error){console.log(JSON.stringify({label,requestedFamily:family||'auto',ok:false,status:error.status??502,code:error.code??'DIAGNOSTIC_FAILURE',lastStage:stage,elapsedMs:Math.round(performance.now()-start),events}))}
}
