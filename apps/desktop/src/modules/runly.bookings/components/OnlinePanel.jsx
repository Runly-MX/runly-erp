import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, SectionCard, Skeleton, StatusPill, SwitchField, copyText } from '@runly/ui'
import { Copy, Eye, Globe, Pencil, Plus, Share2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { KEY, useBookingsMutation, useToken } from '../hooks/useBookings.js'
import { MUTED_TEXT, bookingsError, bookingsPath } from '../lib/bookingsLabels.js'
import { ShareEmbedDialog } from './ShareEmbedDialog.jsx'

// "Reservas online": publish the space and manage its public pages. Turning
// publication off keeps every booking; it only stops new self-scheduling.
export function OnlinePanel({ space, services, canEdit }) {
  const token = useToken()
  const pages = useQuery({ queryKey: [KEY, 'pages', space.id], queryFn: async () => (await runly.bookings.listPages(space.id, token))?.data ?? [], enabled: Boolean(token) })
  const navigate = useNavigate()
  const setEditing = (target) => navigate(bookingsPath(`/spaces/${space.id}/pages/${target === 'new' ? 'new' : target.id}`))
  const [sharing, setSharing] = useState(null)
  const publish = useBookingsMutation((t, published) => runly.bookings.updateSpace(space.id, { published }, t), { success: (_d, v) => (v ? 'Reservas online activadas.' : 'Reservas online desactivadas. Las reservaciones existentes se conservan.') })

  async function preview(page) {
    try {
      const res = await runly.bookings.previewPage(page.id, token)
      window.open(res?.data?.url, '_blank', 'noopener')
    } catch (error) { toast.error(bookingsError(error)) }
  }
  async function copy(page) {
    await copyText(page.url)
    toast.success('Enlace copiado.')
  }
  const serviceName = new Map(services.map((s) => [s.id, s.name]))

  return (
    <div className="space-y-4">
      <SectionCard title="Reservas online" icon={Globe} description="Permite que tus clientes reserven solos desde un enlace, sin cuenta de Runly. Usa los mismos servicios, horarios y políticas de este sistema.">
        <SwitchField
          id="bookings-space-published"
          label="Publicar este sistema"
          description={space.published ? 'Las páginas publicadas aceptan reservaciones.' : 'Ninguna página acepta reservaciones nuevas. Los clientes conservan el acceso a lo que ya reservaron.'}
          checked={Boolean(space.published)} disabled={!canEdit || publish.isPending}
          onChange={(published) => publish.mutate(published)}
        />
      </SectionCard>
      <SectionCard
        title="Páginas públicas"
        icon={Globe}
        description="Una página general o una por servicio. Cada una tiene su dirección, textos y políticas visibles."
        action={canEdit ? <Button type="button" variant="outline" size="sm" onClick={() => setEditing('new')}><Plus />Nueva página</Button> : null}
      >
        {pages.isPending ? <Skeleton className="h-24 w-full" /> : !pages.data?.length ? (
          <EmptyState icon={Globe} title="Sin páginas públicas" description={canEdit ? 'Crea una página y elige qué servicios se pueden reservar en ella.' : undefined} />
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {pages.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <StatusPill tone={p.published && space.published ? 'success' : 'neutral'} size="sm">{p.published ? (space.published ? 'Publicada' : 'Publicada, sistema sin publicar') : 'Borrador'}</StatusPill>
                  </div>
                  <p className={`${MUTED_TEXT} break-all`}>{p.url}</p>
                  <p className={MUTED_TEXT}>{p.serviceIds.map((id) => serviceName.get(id)).filter(Boolean).join(', ') || 'Sin servicios'}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => copy(p)}><Copy />Copiar enlace</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSharing(p)}><Share2 />Compartir e integrar</Button>
                  {canEdit ? <Button type="button" variant="ghost" size="sm" onClick={() => preview(p)}><Eye />Vista previa</Button> : null}
                  {canEdit ? <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(p)}><Pencil />Editar</Button> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <ShareEmbedDialog
        open={Boolean(sharing)} onOpenChange={(v) => !v && setSharing(null)} page={pages.data?.find((p) => p.id === sharing?.id) ?? sharing}
        services={services} live={Boolean(sharing?.published && space.published)} canEdit={canEdit}
      />
    </div>
  )
}
