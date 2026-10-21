import { useEffect, useState } from 'react'
import { Badge, Button, CheckboxField, EmptyState, ErrorState, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, TextareaField } from '@runly/ui'
import { ArrowRight, GitPullRequestArrow, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { useChangeProposals, useReviewChangeProposal } from '../../hooks/useChangeProposals.js'

const NOUN = { serialNumber: 'N.º de serie', assetTag: 'N.º de activo' }
const shown = (v) => (v?.label ?? v?.value) || 'Vacío'
const when = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

function ProposalCard({ proposal }) {
  const review = useReviewChangeProposal()
  const isAccess = proposal.kind === 'access_request'
  const [accepted, setAccepted] = useState(() => new Set(proposal.changes.filter((c) => c.differs).map((c) => c.field)))
  const [note, setNote] = useState('')

  const toggle = (field) => setAccepted((prev) => {
    const next = new Set(prev)
    if (next.has(field)) next.delete(field)
    else next.add(field)
    return next
  })

  async function submit() {
    const decisions = Object.fromEntries(proposal.changes.map((c) => [c.field, accepted.has(c.field) ? 'accept' : 'reject']))
    try {
      const res = await review.mutateAsync({ id: proposal.id, decisions, note: note.trim() })
      toast.success(isAccess ? 'Solicitud atendida' : res.applied.length ? `Se aplicaron ${res.applied.length} cambios` : 'Propuesta rechazada')
    } catch (err) { toast.error(err?.message ?? 'No se pudo revisar la propuesta') }
  }

  return (
    <article className="space-y-3 rounded-md border border-[hsl(var(--border))] p-3">
      <header className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 break-words text-sm font-semibold">{proposal.item.name}</p>
          <Badge variant="outline" className="gap-1">{isAccess ? <><KeyRound className="h-3 w-3" />Acceso</> : 'Cambios'}</Badge>
        </div>
        <p className="break-words text-xs text-[hsl(var(--muted-foreground))]">
          {[proposal.item.areaName, `${NOUN[proposal.matched.field]} ${proposal.matched.value}`].filter(Boolean).join(' · ')}
        </p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{proposal.proposerLabel} · {when(proposal.createdAt)}</p>
      </header>
      {proposal.message ? <p className="whitespace-pre-line rounded-md bg-[hsl(var(--muted))]/50 p-2 text-sm">{proposal.message}</p> : null}
      {isAccess ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Si procede, dale acceso desde Áreas &gt; Miembros y marca la solicitud como atendida.</p>
      ) : (
        <div className="space-y-2">
          {proposal.changes.map((c) => (
            <div key={c.field} className="space-y-1">
              <CheckboxField label={c.label} checked={accepted.has(c.field)} onChange={() => toggle(c.field)} hint={c.differs ? undefined : 'Igual al valor actual'} />
              <p className="flex flex-wrap items-center gap-1.5 pl-7 text-xs">
                <span className="text-[hsl(var(--muted-foreground))]">{shown(c.current)}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                <span className="font-medium">{shown(c.proposed)}</span>
              </p>
            </div>
          ))}
        </div>
      )}
      <TextareaField label="Nota para el historial (opcional)" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="button" className="w-full [@media(pointer:coarse)]:min-h-11" disabled={review.isPending} onClick={submit}>
        {review.isPending ? 'Guardando...' : isAccess ? 'Marcar como atendida' : accepted.size ? `Aplicar ${accepted.size} ${accepted.size === 1 ? 'cambio' : 'cambios'}` : 'Rechazar propuesta'}
      </Button>
    </article>
  )
}

// Pending change proposals and access requests on items in the areas the user can write, reviewed field by field.
export function InventoryProposalsSheet({ open, onOpenChange }) {
  const proposals = useChangeProposals({ enabled: open })
  useEffect(() => { if (open) proposals.refetch() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = proposals.data ?? []
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader className="shrink-0">
          <SheetTitle>Propuestas de cambio</SheetTitle>
          <SheetDescription>Datos que enviaron proveedores y usuarios sin acceso a items que ya existen. Decide cuáles aplicar.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-4">
          {proposals.isLoading ? <Skeleton className="h-32 w-full" />
            : proposals.isError ? <ErrorState title="No se pudieron cargar las propuestas" description={proposals.error?.message} onRetry={() => proposals.refetch()} />
              : rows.length === 0 ? <EmptyState icon={GitPullRequestArrow} title="Sin propuestas pendientes" description="Cuando alguien envíe datos de un item que ya existe aparecerán aquí." />
                : rows.map((p) => <ProposalCard key={p.id} proposal={p} />)}
        </div>
      </SheetContent>
    </Sheet>
  )
}
