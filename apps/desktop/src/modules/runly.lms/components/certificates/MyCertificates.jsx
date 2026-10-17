import { Badge, Button } from '@runly/ui'
import { Award, Download, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDownloadCertificate } from '../../hooks/useLmsCerts.js'
import { formatHours, formatLongDate, verificationLink } from '../../lib/lmsCert.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

async function copyLink(certificate) {
  const link = verificationLink(certificate, window.location.origin)
  try {
    await navigator.clipboard.writeText(link)
    toast.success('Enlace de verificación copiado.')
  } catch {
    toast.error('No se pudo copiar el enlace.')
  }
}

function CertificateCard({ certificate, onDownload, downloading }) {
  const revoked = Boolean(certificate.revokedAt)
  return (
    <li className="flex flex-col gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]">
          <Award className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium leading-tight">{certificate.courseTitle}</p>
          <p className={`${MUTED} mt-1 font-mono`}>{certificate.folio}</p>
        </div>
        {revoked ? <Badge variant="destructive">Revocado</Badge> : null}
      </div>
      <p className={MUTED}>
        {[formatLongDate(certificate.issuedAt), formatHours(certificate.hours)].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button size="sm" className="rounded-md" onClick={() => onDownload(certificate)} disabled={downloading}>
          {downloading ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}Descargar
        </Button>
        {!revoked ? (
          <Button size="sm" variant="outline" className="rounded-md" onClick={() => copyLink(certificate)}><Link2 />Copiar enlace de verificación</Button>
        ) : null}
      </div>
    </li>
  )
}

// "Mis cursos" Certificados section: one card per issued certificate.
export function MyCertificates({ certificates }) {
  const download = useDownloadCertificate({ own: true })
  if (!certificates?.length) return null
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Certificados</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Descarga tus certificados o comparte su enlace de verificación.</p>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {certificates.map((certificate) => (
          <CertificateCard
            key={certificate.id} certificate={certificate} onDownload={(item) => download.mutate(item)}
            downloading={download.isPending && download.variables?.id === certificate.id}
          />
        ))}
      </ul>
    </section>
  )
}
