import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { runly } from '../../../lib/runly.js'

const SharedImageEditor = lazy(() => import('@runly/ui').then(module => ({default:module.ImageEditorDialog})))
const unwrap = value => value?.data ?? value

// Glue only: all editing controls remain in the shared editor. No replace-original callback.
export function useStudioImageEditing({ editorRef, designId, token, canEdit }) {
  const [session,setSession] = useState(null), active = useRef(null), mode = useRef(canEdit)
  const close = useCallback(() => { active.current?.controller.abort(); active.current = null; setSession(null) },[])
  useEffect(() => close,[close,designId,token])
  useLayoutEffect(() => { mode.current=canEdit; if (!canEdit) close() },[canEdit,close])
  const editImage = useCallback(async (objectId, options) => {
    if (!mode.current) throw Error('Diseño de solo lectura.')
    close()
    const editor = editorRef.current, captured = editor.captureImage(objectId)
    const next = {editor,...captured,tab:options?.tab,controller:new AbortController()}
    active.current = next
    const response = unwrap(await runly.studio.assetUrl(designId,captured.fileAssetId,token))
    if (active.current !== next || !mode.current || editorRef.current !== editor) return
    setSession({...next,src:response.signedUrl})
  },[close,editorRef,designId,token])
  async function save(file) {
    const current = active.current
    if (!current || !mode.current || editorRef.current !== current.editor) throw Error('La edición ya no está disponible.')
    if (current.editor.captureImage(current.object.id).fingerprint !== current.fingerprint) throw Error('La imagen cambió. Cierra esta edición y vuelve a abrirla.')
    const copy = unwrap(await runly.studio.saveImageCopy(designId,current.fileAssetId,file,token,current.controller.signal))
    if (active.current !== current || !mode.current || editorRef.current !== current.editor) throw Error('La copia está en Files; la sesión de edición cambió.')
    await current.editor.replaceImage(current.object.id,copy.id,current.fingerprint)
    close()
  }
  return {editImage,dialog:session ? <Suspense fallback={null}><SharedImageEditor open src={session.src} mimeType="image/png" fileName="studio" originalResolution initialTab={session.tab}
    title="Editar copia de la imagen" saveLabel="Guardar copia en Studio" onOpenChange={open => {if (!open) close()}} onSave={save} /></Suspense> : null}
}
