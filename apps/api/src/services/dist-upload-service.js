import {WebsiteServiceError} from '../routes/website/service-helpers.js'

const MIME_MAP = {
  html: 'text/html', css: 'text/css', js: 'application/javascript',
  mjs: 'application/javascript', json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  txt: 'text/plain', xml: 'application/xml', map: 'application/json',
}

export function getMimeType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return MIME_MAP[ext] ?? 'application/octet-stream'
}

export function findRootPrefix(filePaths) {
  if (filePaths.includes('index.html')) return ''
  const wrapped = filePaths.find(p => {
    const parts = p.split('/')
    return parts.length === 2 && parts[1] === 'index.html'
  })
  if (wrapped) return wrapped.slice(0, wrapped.lastIndexOf('/') + 1)
  return null
}

export function detectPrerender(relativePaths) {
  return relativePaths.some(p => p.endsWith('.html') && p !== 'index.html')
}

export function createDistUploadService({publicationContext}) {
  const unavailable=async()=>{throw new WebsiteServiceError('Usa importaciones privadas y comandos de publicaci?n.',409,'publication_requires_explicit_action')}
  return {uploadDist:publicationContext?.imports.create??unavailable,deleteDist:unavailable,listBuilds:unavailable,deleteBuildZip:unavailable}
}
