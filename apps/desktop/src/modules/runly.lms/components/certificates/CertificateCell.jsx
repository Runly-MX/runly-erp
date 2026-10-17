import { Badge, Button } from '@runly/ui'
import { Award } from 'lucide-react'
import { canIssueCertificate } from '../../lib/lmsCert.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Alumnos tab certificate column: folio (downloads the PDF), revoked marker and
// "Emitir" when a completed enrollment lacks a valid certificate.
export function CertificateCell({ enrollment, canManage, onDownload, onIssue, issuing }) {
  const certificate = enrollment.certificate
  const issue = canManage && canIssueCertificate(enrollment)
  if (!certificate && !issue) return <span className={MUTED}>—</span>
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {certificate ? (
        <button
          type="button" onClick={() => onDownload(certificate)} title="Descargar PDF"
          className={`rounded-md font-mono text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${certificate.revokedAt ? 'text-[hsl(var(--muted-foreground))] line-through' : 'text-[hsl(var(--primary))]'}`}
        >
          {certificate.folio}
        </button>
      ) : null}
      {certificate?.revokedAt ? <Badge variant="destructive">Revocado</Badge> : null}
      {issue ? (
        <Button variant="outline" size="sm" className="rounded-md" disabled={issuing} onClick={() => onIssue(enrollment)}>
          <Award />Emitir
        </Button>
      ) : null}
    </div>
  )
}
