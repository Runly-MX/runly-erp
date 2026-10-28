import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { getActiveCompanyId } from '../../../lib/runly.js'

export function isStoredNoteImage(src) {
  return typeof src === 'string' && /\/storage\/v1\/(?:object|render\/image)\/(?:public|authenticated|sign)\/(?:runly-notes|atlas-notes)\//.test(src)
}

// Only render-time bytes change. Never put the blob URL, a signed URL or an
// auth token back into node attrs, HTML, Y.Doc or the Excalidraw manifest.
export async function fetchNoteImage(src, { noteId, token, publicSlug, signal } = {}) {
  if (!isStoredNoteImage(src)) return fetch(src, { signal })
  if (!publicSlug && (!noteId || !token)) throw Error('No se pudo autorizar la imagen.')
  const path = publicSlug ? `/public/notes/${encodeURIComponent(publicSlug)}/media` : `/notes/${encodeURIComponent(noteId)}/media`
  // Historical signed URLs are references too; never forward their old token
  // to API query logs. Only a configured Storage bucket/key will be used.
  const reference = new URL(src, 'https://reference.invalid').pathname
  return fetch(`${getApiUrl()}${path}?src=${encodeURIComponent(reference)}`, {
    signal, cache: 'no-store', headers: publicSlug ? {} : {
      Authorization: `Bearer ${token}`, ...(getActiveCompanyId() ? { 'X-Runly-Company-Id': getActiveCompanyId() } : {}),
    },
  })
}

export async function attachNoteImages(sources, { noteId, token }) {
  const response = await fetch(`${getApiUrl()}/notes/${encodeURIComponent(noteId)}/images/attach`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      ...(getActiveCompanyId() ? { 'X-Runly-Company-Id': getActiveCompanyId() } : {}) },
    body: JSON.stringify({ sources: sources.map(src => new URL(src, 'https://reference.invalid').pathname) }),
  })
  if (!response.ok) throw Error('No tienes acceso a una de las imagenes que intentas pegar.')
}
