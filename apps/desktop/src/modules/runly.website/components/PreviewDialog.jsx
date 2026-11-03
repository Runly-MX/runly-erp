import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import { ExternalLink, Eye, Loader2 } from 'lucide-react'
import { newIdempotencyKey } from '../lib/websiteApi.js'
import { useWebsiteScope } from '../hooks/useWebsite.js'
import { ErrorNotice } from './ErrorNotice.jsx'

// Private, read-only preview on an isolated origin (S4). Opens either a ready
// release (`releaseId`) or the saved draft of the whole site (`draftPageIds`).
// The URL carries a one-time token in its fragment; it is never logged or
// stored here, and the session is revoked when the dialog closes. Forms,
// analytics, Calendar and live catalog are intentionally off in previews.
export function PreviewDialog({ open, onOpenChange, siteId, releaseId = null, draftPageIds = [], title = 'Vista previa del sitio' }) {
  const { api } = useWebsiteScope()
  const [state, setState] = useState({ status: 'idle', preview: null, error: null })
  const sessionRef = useRef(null)
  const keyRef = useRef(null)

  useEffect(() => {
    if (!open || !api || !siteId) return undefined
    let alive = true
    keyRef.current = newIdempotencyKey()
    setState({ status: 'loading', preview: null, error: null })
    ;(async () => {
      try {
        let body
        if (releaseId) body = { releaseId }
        else {
          const site = (await api.getSite(siteId)).data
          body = {
            kind: 'builder',
            baseReleaseId: site.activeReleaseId ?? null,
            expectedDraftRevision: String(site.draftRevision),
            expectedPublicationRevision: String(site.publicationRevision),
            changes: { publishPageIds: draftPageIds, includeThemeAndMenus: true },
          }
        }
        const preview = (await api.createPreview(siteId, body, keyRef.current)).data
        if (!alive) { api.revokePreview(siteId, preview.id).catch(() => {}); return }
        sessionRef.current = preview.id
        setState({ status: 'ready', preview, error: null })
      } catch (error) {
        if (alive) setState({ status: 'error', preview: null, error })
      }
    })()
    return () => {
      alive = false
      const id = sessionRef.current
      sessionRef.current = null
      if (id) api.revokePreview(siteId, id).catch(() => {})
    }
    // draftPageIds identity changes each render; the ids joined are the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, api, siteId, releaseId, draftPageIds.join(',')])

  const { status, preview, error } = state
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="flex max-h-[90dvh] flex-col">
        <DialogHeader icon={Eye}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Es privada, solo lectura y caduca en 15 minutos. Los formularios y las reservas no envían datos desde aquí.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[hsl(var(--border))]" style={{ minHeight: '50dvh' }}>
          {status === 'loading' && (
            <div className="flex h-full min-h-[40dvh] items-center justify-center gap-2 text-sm" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Preparando la vista previa…
            </div>
          )}
          {status === 'error' && <div className="p-4"><ErrorNotice error={error} /></div>}
          {status === 'ready' && (
            <p className="p-6 text-sm">La vista previa se abre en una pestaña independiente para conservar el aislamiento y la cookie privada. El enlace se utiliza una sola vez; cierra este diálogo para generar otro.</p>
          )}
        </div>
        <DialogFooter>
          {status === 'ready' && (
            <Button variant="outline" asChild>
              <a href={preview.url} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" /> Abrir en otra pestaña</a>
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
