import yauzl from 'yauzl'
import {crc32} from 'node:zlib'
import {posix} from 'node:path'
import {WebsiteServiceError} from '../routes/website/service-helpers.js'
import {releaseBytesHash} from './website-release-storage.js'

export const STATIC_ZIP_POLICY=Object.freeze({version:'static-v1',compressed:100*1024**2,total:400*1024**2,entry:50*1024**2,files:10000,ratio:200,timeout:30000})
const mime={html:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',eot:'application/vnd.ms-fontobject',txt:'text/plain',xml:'application/xml',webmanifest:'application/manifest+json',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',wasm:'application/wasm'}
const fail=(code,status=422)=>new WebsiteServiceError('El artefacto no cumple la política estática.',status,code)
export function zipArtifactPath(name,{directory=false}={}) {
  if(typeof name!=='string'||Buffer.byteLength(name)>512||/[^\x20-\x7e]|[\\:%?#]/.test(name)||name.startsWith('/'))throw fail('unsafe_archive_path')
  const path=directory?name.replace(/\/$/,''):name,parts=path.split('/')
  if(parts.length>32||parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)))throw fail('unsafe_archive_path')
  return path.normalize('NFC')
}
function accepted(path) {
  const parts=path.toLowerCase().split('/'),file=parts.at(-1),ext=file.split('.').at(-1)
  if(parts.some(p=>p.startsWith('.')||['node_modules','__macosx'].includes(p))||['__runly','__preview','__website_admin_gate','app','api','auth','public','mcp','p'].includes(parts[0])||/^(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|server\.[cm]?js|middleware\.[cm]?js)$/.test(file)||!mime[ext])throw fail('unexpected_archive_file')
  return mime[ext]
}
// Read original names with decodeStrings:false. Nothing is extracted to disk.
export async function inspectWebsiteZip(buffer,{routingMode='mpa',rootDirectory,limits=STATIC_ZIP_POLICY,onFile=async()=>{}}={}) {
  if(!Buffer.isBuffer(buffer)||buffer.length>limits.compressed)throw fail('archive_too_large',413)
  if(!['mpa','spa'].includes(routingMode))throw fail('invalid_routing_mode')
  let directoryStart=null
  for(let offset=buffer.length-22;offset>=Math.max(0,buffer.length-65557);offset--){
    if(buffer.readUInt32LE(offset)!==0x06054b50||offset+22+buffer.readUInt16LE(offset+20)!==buffer.length)continue
    if(buffer.readUInt16LE(offset+4)||buffer.readUInt16LE(offset+6)||buffer.readUInt16LE(offset+8)!==buffer.readUInt16LE(offset+10))throw fail('unsupported_archive_encoding')
    directoryStart=buffer.readUInt32LE(offset+16)
    if(directoryStart+buffer.readUInt32LE(offset+12)!==offset)throw fail('invalid_archive')
    break
  }
  if(directoryStart===null)throw fail('invalid_archive')
  const started=Date.now(),files=[],seen=new Set(),ranges=[];let total=0,compressed=0,count=0
  const zip=await new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true,decodeStrings:false,validateEntrySizes:true,strictFileNames:true},(e,z)=>e?reject(fail('invalid_archive')):resolve(z)))
  try {
    await new Promise((resolve,reject)=>{
      let settled=false
      const done=e=>{if(settled)return;settled=true;clearTimeout(timer);if(e){zip.close();reject(e instanceof WebsiteServiceError?e:fail('invalid_archive'))}else resolve()}
      const timer=setTimeout(()=>done(fail('archive_timeout',413)),limits.timeout)
      zip.on('error',done);zip.on('end',()=>done());zip.on('entry',entry=>{(async()=>{
        if(Date.now()-started>limits.timeout)throw fail('archive_timeout',413)
        if(++count>limits.files)throw fail('archive_file_limit',413)
        if(entry.generalPurposeBitFlag&1||![0,8].includes(entry.compressionMethod))throw fail('unsupported_archive_encoding')
        const name=new TextDecoder('utf-8',{fatal:true}).decode(entry.fileName),directory=name.endsWith('/')
        const offset=entry.relativeOffsetOfLocalHeader
        if(offset+30>directoryStart||buffer.readUInt32LE(offset)!==0x04034b50)throw fail('invalid_archive')
        const nameLength=buffer.readUInt16LE(offset+26),dataStart=offset+30+nameLength+buffer.readUInt16LE(offset+28),end=dataStart+entry.compressedSize
        if(end>directoryStart||!buffer.subarray(offset+30,offset+30+nameLength).equals(entry.fileName)||ranges.some(r=>offset<r.end&&end>r.start))throw fail('overlapping_archive_entries')
        ranges.push({start:offset,end})
        const path=zipArtifactPath(name,{directory}),folded=path.toLowerCase()
        if(seen.has(folded))throw fail('duplicate_archive_path');seen.add(folded)
        const type=(entry.externalFileAttributes>>>16)&0xf000
        if(type&&type!==(directory?0x4000:0x8000))throw fail('archive_link_or_special_file')
        if(directory){if(entry.compressedSize||entry.uncompressedSize)throw fail('invalid_archive');zip.readEntry();return}
        const contentType=accepted(path)
        if(entry.uncompressedSize>limits.entry||entry.uncompressedSize/Math.max(1,entry.compressedSize)>limits.ratio)throw fail('archive_expansion_limit',413)
        total+=entry.uncompressedSize;compressed+=entry.compressedSize
        if(total>limits.total||total/Math.max(1,compressed)>limits.ratio)throw fail('archive_expansion_limit',413)
        const stream=await new Promise((res,rej)=>zip.openReadStream(entry,(e,s)=>e?rej(e):res(s)))
        const chunks=[];let size=0,crc=0
        for await(const chunk of stream){size+=chunk.length;if(size>limits.entry||size>entry.uncompressedSize)throw fail('archive_expansion_limit',413);crc=crc32(chunk,crc);chunks.push(chunk)}
        if(size!==entry.uncompressedSize||crc!==entry.crc32)throw fail('archive_integrity_failed')
        const bytes=Buffer.concat(chunks),record={path,mime:contentType,size,hash:releaseBytesHash(bytes)}
        // The service writes only immutable private objects, never public aliases.
        await onFile(record,bytes);files.push(record);zip.readEntry()
      })().catch(done)})
      zip.readEntry()
    })
    const paths=files.map(f=>f.path)
    let root=rootDirectory===undefined?(paths.includes('index.html')?'':null):zipArtifactPath(rootDirectory)+'/'
    if(root===null){const candidates=paths.filter(p=>/^[^/]+\/index\.html$/.test(p));if(candidates.length!==1)throw fail('ambiguous_archive_root');root=candidates[0].slice(0,-10)}
    if(!paths.includes(root+'index.html')||paths.some(p=>!p.startsWith(root)))throw fail('archive_root_mismatch')
    const normalized=files.map(f=>({...f,path:f.path.slice(root.length)}))
    return {policyVersion:limits.version,routingMode,rootDirectory:root,files:normalized,observed:{files:count,compressed:buffer.length,expanded:total},discarded:[]}
  }finally{zip.close()}
}
export function validateStaticReferences(files,texts) {
  const paths=new Set(files.map(f=>f.path))
  function check(from,ref) {
    if(!ref||ref.startsWith('#')||ref.startsWith('data:'))return
    if(/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref))throw fail('external_artifact_dependency')
    const clean=ref.split(/[?#]/)[0]
    if(!clean)return
    if(/\\|%/.test(clean))throw fail('unsafe_artifact_reference')
    const target=posix.normalize(clean.startsWith('/')?clean.slice(1):posix.join(posix.dirname(from),clean))
    if(target.startsWith('../')||!paths.has(target))throw fail('missing_artifact_dependency')
  }
  for(const file of files){const text=texts.get(file.path);if(text===undefined)continue
    if(file.mime==='text/html'){
      if(/<base\b|http-equiv\s*=\s*["']?refresh/i.test(text.replace(/<base\s+href=["']\/["']\s*\/?>/gi,'')))throw fail('unsupported_artifact_base')
      for(const m of text.matchAll(/<(?:script|link|img|source|video|audio|iframe|object)\b[^>]*?\b(?:src|href|poster|data)\s*=\s*["']([^"']+)["']/gi))check(file.path,m[1])
      for(const m of text.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi))for(const src of m[1].split(','))check(file.path,src.trim().split(/\s/)[0])
    }
    if(['text/css','text/javascript'].includes(file.mime)){
      if(/\b(?:require\s*\(|from\s*["'](?:node:|fs["']|express["'])|process\.env|__dirname|createServer\s*\()/m.test(text))throw fail('server_artifact_not_supported')
      const patterns=file.mime==='text/css'?[/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi,/@import\s*["']([^"']+)["']/gi]:[/\b(?:import|export)\s+(?:[^"'();]*?\s+from\s*)?["']([^"']+)["']/g,/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,/new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g]
      for(const pattern of patterns)for(const m of text.matchAll(pattern)){if(file.mime==='text/javascript'&&!/^[./]/.test(m[1]))throw fail('bare_import_not_supported');check(file.path,m[1])}
    }
  }
}
