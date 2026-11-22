import { useState } from 'react'
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState, ErrorState, Skeleton, formatBytes,
} from '@runly/ui'
import { Download, FileStack, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { unwrap, useRead, useToken } from '../../hooks/useLmsData.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' }) : '—')
const STATUS = { active: ['Vigente', 'success'], replaced: ['Reemplazada', 'outline'], removed: ['Quitada', 'outline'] }

// Graders: what a participant delivered, every version with its integrity data.
// Only current versions are graded; earlier ones are kept for audit.
export function SessionFilesDialog({ session, participant, onOpenChange }) {
  const token = useToken()
  const query = useRead(['session-files', session?.id], (t) => runly.lms.getSessionFiles(session.id, t), { enabled: Boolean(session?.id) })
  const [busy, setBusy] = useState(null)

  async function download(version) {
    setBusy(version.id)
    try {
      const { url } = unwrap(await runly.lms.downloadSessionFileVersion(version.id, token))
      const link = Object.assign(document.createElement('a'), { href: url, rel: 'noopener' })
      document.body.appendChild(link); link.click(); link.remove()
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar el archivo.')
    } finally { setBusy(null) }
  }

  const deliveries = (query.data?.deliveries ?? []).filter((item) => item.versions.length)
  return (
    <Dialog open={Boolean(session)} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={FileStack} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>Entregas de {participant ?? 'la persona'}</DialogTitle>
          <DialogDescription>Se califica la versión vigente de cada archivo. Las anteriores quedan para auditoría.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
          {query.isLoading ? <Skeleton className="h-40 rounded-md" /> : null}
          {query.isError ? <ErrorState title="No se pudieron cargar las entregas" description={query.error?.message} onRetry={() => query.refetch()} /> : null}
          {query.data && !deliveries.length ? <EmptyState icon={FileStack} title="Sin archivos" description="Esta persona no subió archivos en esta sesión." /> : null}
          {deliveries.map((delivery) => (
            <section key={delivery.activityId} className="space-y-2">
              <h3 className="text-sm font-semibold">{delivery.title ?? 'Actividad'}</h3>
              <ul className="space-y-2">
                {delivery.versions.map((version) => {
                  const [label, variant] = STATUS[version.status] ?? [version.status, 'outline']
                  return (
                    <li key={version.id} className="flex flex-wrap items-center gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2" data-testid="review-version">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          <span className="truncate">{version.fileName}</span>
                          <Badge variant={variant}>{label}</Badge>
                          <span className={MUTED}>Archivo {version.slot} · versión {version.version}</span>
                          {version.afterClose ? <Badge variant="warning">Recibido tras el cierre</Badge> : null}
                        </p>
                        <p className={MUTED}>
                          {version.fileType.toUpperCase()} · {formatBytes(version.sizeBytes)} · recibido {dateTime(version.confirmedAt)}
                          {version.replacedAt ? ` · ${version.status === 'removed' ? 'quitado' : 'reemplazado'} ${dateTime(version.replacedAt)}` : ''}
                        </p>
                        <p className={`${MUTED} flex items-center gap-1 break-all font-mono`} title="Huella SHA-256 verificada por el servidor">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{version.sha256}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => download(version)} disabled={busy === version.id}>
                        {busy === version.id ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}Descargar
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
