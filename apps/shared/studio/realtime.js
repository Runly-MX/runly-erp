// Ephemeral protocol only. Never feed these messages into document operations.
export const STUDIO_REALTIME = Object.freeze({ version: 1, leaseMs: 30000, renewMs: 20000, cursorMs: 100, maxSessions: 100, maxBytes: 2048 })
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const id = /^[a-zA-Z0-9_-]{1,64}$/
const session = /^[a-f0-9]{32}$/
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === names.length && names.every(k => Object.hasOwn(value,k))
export const publicSessionId = value => typeof value === 'string' && session.test(value)
export const publicKeyPattern = /^[A-Za-z0-9_-]{87}$/
export const signaturePattern = /^[A-Za-z0-9_-]{86}$/
export const canonicalRealtime = value => JSON.stringify(value, Object.keys(value).sort())
export const realtimeBytes = value => new TextEncoder().encode(canonicalRealtime(value))
export const realtimeSize = value => new TextEncoder().encode(JSON.stringify(value)).byteLength
export function encodeRealtime(bytes) { let text=''; for(const byte of new Uint8Array(bytes))text+=String.fromCharCode(byte); return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'') }
export function decodeRealtime(text) { return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)) }
export function validCertificate(c, { designId, companyId, epoch, now }) {
  return keys(c,['v','designId','companyId','actorId','sessionId','publicKey','name','role','epoch','issuedAt','expiresAt']) && c.v===1 &&
    uuid.test(c.designId) && uuid.test(c.companyId) && uuid.test(c.actorId) && c.designId===designId && c.companyId===companyId && c.epoch===epoch &&
    publicSessionId(c.sessionId) && publicKeyPattern.test(c.publicKey) && typeof c.name==='string' && c.name.length<=120 &&
    ['OWNER','EDITOR','VIEWER'].includes(c.role) && /^\d{1,20}$/.test(c.epoch) && Number.isSafeInteger(c.issuedAt) && Number.isSafeInteger(c.expiresAt) &&
    c.issuedAt<=now+2000 && c.expiresAt>now && c.expiresAt>c.issuedAt && c.expiresAt-c.issuedAt<=STUDIO_REALTIME.leaseMs
}
export function validEphemeral(p, certificate, pages, now, maxAge = 5000) {
  if(!keys(p,['v','sessionId','type','seq','at','pageId','x','y','selectedId','activity']) || p.v!==1 || p.sessionId!==certificate.sessionId ||
    !['cursor','selection','page','activity'].includes(p.type) || !Number.isSafeInteger(p.seq) || p.seq<1 || !Number.isSafeInteger(p.at) ||
    p.at<certificate.issuedAt-2000 || p.at>now+2000 || now-p.at>maxAge || p.at>=certificate.expiresAt || certificate.expiresAt<=now ||
    typeof p.pageId!=='string' || !id.test(p.pageId) || !['active','idle'].includes(p.activity) ||
    p.selectedId!==null && (typeof p.selectedId!=='string'||!id.test(p.selectedId))) return false
  const page=pages.find(row=>row.id===p.pageId)
  return Boolean(page && ((p.x===null && p.y===null) || typeof p.x==='number' && Number.isFinite(p.x) && p.x>=0 && p.x<=page.width && typeof p.y==='number' && Number.isFinite(p.y) && p.y>=0 && p.y<=page.height))
}
export async function createEphemeralKey(crypto = globalThis.crypto) {
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify'])
  return { pair, publicKey:encodeRealtime(await crypto.subtle.exportKey('raw',pair.publicKey)) }
}
export async function signEphemeral(payload, privateKey, crypto = globalThis.crypto) {
  return {payload,signature:encodeRealtime(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,realtimeBytes(payload)))}
}
export async function verifyAttestation(certificate, signature, key, crypto = globalThis.crypto) {
  if(!signaturePattern.test(signature ?? '')||!/^[A-Za-z0-9_-]{43}$/.test(key ?? ''))return false
  try { const publicKey=await crypto.subtle.importKey('raw',decodeRealtime(key),'Ed25519',false,['verify']); return await crypto.subtle.verify('Ed25519',publicKey,decodeRealtime(signature),realtimeBytes(certificate)) } catch {return false}
}
export async function importEphemeralKey(key, crypto = globalThis.crypto) {
  return crypto.subtle.importKey('raw',decodeRealtime(key),{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
}
export async function verifyEphemeral(envelope, key, crypto = globalThis.crypto) {
  if(!keys(envelope,['payload','signature']) || !signaturePattern.test(envelope.signature ?? ''))return false
  try{return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decodeRealtime(envelope.signature),realtimeBytes(envelope.payload))}catch{return false}
}

// One in-flight job, one latest value. No queue of intermediate cursor samples.
export function createLatestSender(send,{timers=globalThis,now=()=>Date.now(),interval=STUDIO_REALTIME.cursorMs,onError=()=>{}}={}) {
  let pending, timer, busy=false, closed=false, sentAt=-Infinity
  const schedule=()=>{if(closed||busy||timer!==undefined||pending===undefined)return;timer=timers.setTimeout(()=>{timer=undefined;void flush()},Math.max(0,interval-(now()-sentAt)))}
  async function flush(){
    if(closed||busy||pending===undefined)return
    busy=true;const value=pending;pending=undefined;sentAt=now()
    try{await send(value)}catch(error){onError(error)}finally{busy=false;schedule()}
  }
  return {push(value){if(closed)return;pending=value;schedule()},cancel(){closed=true;pending=undefined;timers.clearTimeout(timer);timer=undefined},state:()=>({busy,pending:pending!==undefined,scheduled:timer!==undefined,closed})}
}
