import { useEffect, useState, useContext, createContext } from 'react'
import { isStoredNoteImage, fetchNoteImage } from '../lib/noteImageAccess.js'
import { useAuth } from '../../../auth/AuthProvider.jsx'

export const NoteImageContext = createContext({})

export function useNoteImage(src, explicit = {}) {
  const context = useContext(NoteImageContext)
  const { session } = useAuth()
  const noteId = explicit.noteId ?? context.noteId
  const publicSlug = explicit.publicSlug ?? context.publicSlug
  const token = explicit.token ?? session?.access_token
  const [resolved, setResolved] = useState(null)
  useEffect(() => {
    if (!isStoredNoteImage(src)) return
    const controller = new AbortController()
    let blobUrl, retryTimer, attempts = 0
    const load = async () => {
      try {
        const response = await fetchNoteImage(src, { noteId, publicSlug, token, signal: controller.signal })
        if (!response.ok) {
          if ([401,403,404,415].includes(response.status)) return
          throw Error('Imagen no disponible')
        }
        const blob = await response.blob()
        if (controller.signal.aborted) return
        blobUrl = URL.createObjectURL(blob)
        setResolved({ src, noteId, publicSlug, token, url: blobUrl })
      } catch {
        if (!controller.signal.aborted && attempts < 3) retryTimer = setTimeout(load, 500 * 2 ** attempts++)
      }
    }
    load()
    return () => { controller.abort(); clearTimeout(retryTimer); if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [src, noteId, publicSlug, token])
  if (!isStoredNoteImage(src)) return src
  return resolved?.src === src && resolved.noteId === noteId && resolved.publicSlug === publicSlug && resolved.token === token ? resolved.url : undefined
}
