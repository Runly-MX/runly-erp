import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, Button, CopyableValue, FileUploader, SectionCard, StatusPill, SwitchField, TagsField, TextareaField, copyText } from '@runly/ui'
import { normalizeEmbedOrigin } from '@runly/validators'
import { Code2, Eye, Globe, ImagePlus, Link2, Loader2, Megaphone, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { runly } from '../../../lib/runly.js'
import { useTicketingMutation, useToken } from '../hooks/useTicketing.js'

const MUTED = 'text-sm text-[hsl(var(--muted-foreground))]'
const unwrap = (r) => r?.data ?? r

// "Publicación" (F6E): public page, sales, cover, sharing, embed and the Website block.
// Only free tickets are issued online; paid ones keep being sold at the box office.
export function PublicationTab({ event, canEdit }) {
  const navigate = useNavigate()
  const token = useToken()
  const url = `${window.location.origin}/app/p/boletos/${event.slug}`
  const [origins, setOrigins] = useState(event.embedOrigins ?? [])
  useEffect(() => { setOrigins(event.embedOrigins ?? []) }, [event.embedOrigins])
  const update = useTicketingMutation((t, data) => runly.ticketing.updateEvent(event.id, data, t), { success: 'Publicación actualizada.' })
  const [previewing, setPreviewing] = useState(false)
  const snippet = useMemo(() => `<iframe src="${url}?embed=1" title="${event.title.replace(/"/g, '&quot;')}" style="width:100%;min-height:900px;border:0" loading="lazy"></iframe>`, [url, event.title])
  const freeTypes = (event.types ?? []).filter((t) => t.enabled && t.priceMode === 'free' && t.visibility === 'public').length
  const scheduled = (event.sessions ?? []).filter((s) => s.status === 'scheduled' && new Date(s.endsAt) > new Date()).length
  const dirtyOrigins = JSON.stringify(origins) !== JSON.stringify(event.embedOrigins ?? [])

  async function preview() {
    setPreviewing(true)
    try { window.open(unwrap(await runly.ticketing.previewEvent(event.id, token)).url, '_blank', 'noopener') } catch { toast.error('No se pudo abrir la vista previa.') } finally { setPreviewing(false) }
  }
  async function share() {
    if (navigator.share) { await navigator.share({ title: event.title, url }).catch(() => {}); return }
    if (await copyText(url)) toast.success('Enlace copiado.')
  }
  async function uploadCover(file) {
    const form = new FormData()
    form.append('file', file)
    form.append('moduleKey', 'runly.ticketing')
    form.append('entityType', 'TicketEvent')
    form.append('entityId', event.id)
    const asset = unwrap(await runly.files.upload(form, token))
    await update.mutateAsync({ imageFileId: asset.id })
    return asset
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="Página pública" icon={Megaphone} description="Tu evento en una página propia, sin que tus asistentes creen cuenta.">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={event.published ? 'success' : 'neutral'}>{event.published ? 'Publicado' : 'Sin publicar'}</StatusPill>
            <StatusPill tone={event.salesOpen ? 'success' : 'warning'}>{event.salesOpen ? 'Venta en línea abierta' : 'Venta en línea cerrada'}</StatusPill>
          </div>
          <SwitchField id="ticketing-event-published" label="Publicar el evento" description="Cualquiera con el enlace verá la página. Sin publicar, la dirección responde «no disponible»." checked={event.published} disabled={!canEdit || update.isPending} onChange={(published) => update.mutate({ published })} />
          <SwitchField id="ticketing-event-sales-open" label="Entregar boletos gratuitos en línea" description="Con la venta cerrada, la página informa pero no emite boletos." checked={event.salesOpen} disabled={!canEdit || update.isPending} onChange={(salesOpen) => update.mutate({ salesOpen })} />
          {event.published && (!scheduled || !freeTypes) ? (
            <Alert><AlertDescription>{!scheduled ? 'No hay funciones próximas: la página mostrará el evento como terminado.' : 'No hay boletos gratuitos públicos: la página solo indicará que se compran en taquilla.'}</AlertDescription></Alert>
          ) : null}
          <CopyableValue label="Dirección pública" value={url} mono />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={preview} disabled={previewing}>{previewing ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Eye />}Vista previa</Button>
            <Button type="button" variant="outline" onClick={share}><Share2 />Compartir</Button>
            {event.published ? <Button asChild variant="outline"><a href={url} target="_blank" rel="noopener noreferrer"><Link2 />Abrir página</a></Button> : null}
          </div>
          <p className={MUTED}>Los boletos con precio no se cobran en línea: la página indica que se compran en taquilla.</p>
        </div>
      </SectionCard>

      <SectionCard title="Portada" icon={ImagePlus} description="Una imagen horizontal (16:9) de buena calidad. Se muestra en la página, en la tarjeta de Website y al compartir.">
        <FileUploader accept="image/jpeg,image/png,image/webp" maxSizeMB={8} disabled={!canEdit || update.isPending} onUpload={uploadCover}
          hint={event.imageFileId ? 'Ya hay una portada. Sube otra para reemplazarla.' : 'Arrastra una imagen o selecciónala.'} emptyLabel="Subir portada" />
        {event.imageFileId && canEdit ? <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => update.mutate({ imageFileId: null })}>Quitar portada</Button> : null}
      </SectionCard>

      <SectionCard title="Insertar en otro sitio" icon={Code2} description="Pega este código en tu sitio. Solo los sitios autorizados pueden mostrarlo; tus sitios de Runly Website ya lo están.">
        <div className="space-y-4">
          <TextareaField label="Código de inserción" value={snippet} readOnly rows={3} className="font-mono text-xs" />
          <Button type="button" variant="outline" onClick={async () => { if (await copyText(snippet)) toast.success('Código copiado.') }}>Copiar código</Button>
          <TagsField label="Sitios autorizados" placeholder="https://www.tusitio.com (Enter para agregar)" value={origins} onChange={setOrigins} disabled={!canEdit}
            normalizeItem={(v) => normalizeEmbedOrigin(v) ?? v.trim()} validateItem={(v) => (normalizeEmbedOrigin(v) ? null : 'Escribe el origen completo, por ejemplo https://www.tusitio.com')} />
          {canEdit ? <Button type="button" disabled={!dirtyOrigins || update.isPending} onClick={() => update.mutate({ embedOrigins: origins })}>Guardar sitios autorizados</Button> : null}
        </div>
      </SectionCard>

      <SectionCard title="Runly Website" icon={Globe} description="Agrega el bloque «Evento con boletos» a cualquier página de tu sitio: tarjeta del evento, portal integrado, botón o enlace.">
        <div className="space-y-3">
          <p className={MUTED}>{event.published ? 'Este evento ya aparece en el selector del bloque.' : 'Publica el evento para poder elegirlo en el bloque.'}</p>
          <Button type="button" variant="outline" onClick={() => navigate('/app/m/runly.website')}><Globe />Abrir Website</Button>
        </div>
      </SectionCard>
    </div>
  )
}
