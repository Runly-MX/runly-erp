import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, ProgressBar } from '@runly/ui'
import { ClipboardList, IdCard } from 'lucide-react'
import { guestAnswerRows } from '../../lib/lmsIntake.js'
import { ENROLLMENT_STATUS_LABELS, formatShortDate } from '../../lib/lmsLabels.js'

const MUTED = 'text-[hsl(var(--muted-foreground))]'

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
      <dt className={MUTED}>{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

// Alumnos tab: what a share-link guest answered in the intake form, plus progress.
// fields: the course intake fields (labels); answers to removed fields still show.
export function GuestDetailsDialog({ open, onOpenChange, enrollment, fields = [] }) {
  const learner = enrollment?.learner
  const rows = guestAnswerRows(learner?.guestProfile, fields)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={IdCard} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>{learner?.displayName ?? 'Invitado'}</DialogTitle>
          <DialogDescription>Datos que escribió al entrar con el enlace del curso.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <dl className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
            <Row label="Nombre">{learner?.displayName ?? '—'}</Row>
            {learner?.email ? <Row label="Correo">{learner.email}</Row> : null}
            {rows.filter((row) => row.key !== 'correo' || row.value !== learner?.email).map((row) => <Row key={row.key} label={row.label}>{row.value}</Row>)}
          </dl>
          {!rows.length ? <EmptyState icon={ClipboardList} title="Sin datos adicionales" description="El formulario del curso no pedía más datos cuando esta persona entró." /> : null}
          <dl className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
            <Row label="Avance">
              <span className="flex items-center gap-2"><ProgressBar value={enrollment?.progressPct ?? 0} className="flex-1" /><span className="tabular-nums">{enrollment?.progressPct ?? 0}%</span></span>
            </Row>
            <Row label="Estado">{ENROLLMENT_STATUS_LABELS[enrollment?.status] ?? '—'}</Row>
            <Row label="Inicio">{formatShortDate(enrollment?.startedAt) || '—'}</Row>
            <Row label="Completado">{formatShortDate(enrollment?.completedAt) || '—'}</Row>
            {enrollment?.certificate?.folio ? <Row label="Certificado">{enrollment.certificate.folio}</Row> : null}
          </dl>
        </div>
        <DialogFooter className="mt-0 shrink-0 px-5 py-3">
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
