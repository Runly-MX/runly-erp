import { useState } from 'react'
import { Badge, Button, formatBytes } from '@runly/ui'
import { Download, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { unwrap, useToken } from '../../hooks/useLmsData.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' }) : '—')
const STATUS = { active: ['Vigente', 'success'], replaced: ['Reemplazada', 'outline'], removed: ['Quitada', 'outline'] }

// Every version of a delivery with status, time and the SHA-256 verified by the
// server; each download asks for a 2-minute URL. Only current versions are graded.
export function DeliveryVersions({ versions }) {
  const token = useToken()
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
  return (
    <ul className="space-y-2">
      {versions.map((version) => {
        const [label, variant] = STATUS[version.status] ?? [version.status, 'outline']
        return (
          <li key={version.id} className="flex flex-wrap items-center gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2" data-testid="review-version">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span className="min-w-0 break-all">{version.fileName}</span>
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
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => download(version)} disabled={busy === version.id}>
              {busy === version.id ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}Descargar
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
