import { createHash } from 'node:crypto'
import { WebsiteServiceError } from '../routes/website/service-helpers.js'
export const releaseBytesHash = bytes => createHash('sha256').update(bytes).digest('hex')
const unavailable = () => new WebsiteServiceError('Almacenamiento privado no disponible.',503,'dependency_unavailable')
export function createWebsiteReleaseStorage({supabaseAdmin}) {
  const bucket='runly-website-releases'
  async function privateBucket() {
    try {
    const result=await supabaseAdmin?.storage?.getBucket(bucket)
    if(result?.error || !result?.data || result.data.public !== false) throw unavailable()
    return supabaseAdmin.storage.from(bucket)
    }catch{throw unavailable()}
  }
  async function get(key) {
    try {
    const client=await privateBucket(), result=await client.download(key)
    if(result.error || !result.data) throw unavailable()
    return Buffer.from(await result.data.arrayBuffer())
    }catch{throw unavailable()}
  }
  async function put(key,bytes,mime) {
    try {
    const client=await privateBucket(), result=await client.upload(key,bytes,{upsert:false,contentType:mime})
    if(result.error) {
      // Concurrent create-only writers may have installed the same bytes.
      const existing=await get(key)
      if(releaseBytesHash(existing)!==releaseBytesHash(bytes)) throw unavailable()
    }
    }catch{throw unavailable()}
  }
  return {get,put}
}
