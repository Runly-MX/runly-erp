import { useEffect, useState } from 'react'
import { ConfirmDialog, RadioGroupField, TextareaField } from '@runly/ui'
import { useRelationImpact, useRelationMutations } from '../../hooks/usePurchases.js'

const DEPENDENT_OPTIONS = [
  { value: 'keep', label: 'Conservar las relaciones derivadas', description: 'Siguen ligadas y dejan de marcarse como heredadas de esta.' },
  { value: 'remove', label: 'Quitarlas también', description: 'Se quitan junto con esta relación.' },
]

// Unlinks one relation after showing its impact (GET /purchases/relations/:id/impact):
// structural links are refused and derived links need an explicit choice.
// `relation`: { id, label } or null.
export function UnlinkRelationDialog({ relation, onOpenChange, onDone }) {
  const open = Boolean(relation)
  const impact = useRelationImpact(relation?.id, open)
  const { remove } = useRelationMutations()
  const [mode, setMode] = useState('keep')
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) { setMode('keep'); setReason('') } }, [open, relation?.id])

  const data = impact.data
  const dependents = data?.dependents ?? []
  const blocked = Boolean(data?.protected)
  const confirm = () => remove.mutate(
    { id: relation.id, dependents: dependents.length ? mode : undefined, reason: reason.trim() || undefined },
    { onSuccess: () => { onOpenChange(false); onDone?.() } },
  )

  return (
    <ConfirmDialog open={open} onOpenChange={onOpenChange} title="Quitar relación"
      description={blocked ? data.reason : 'Los documentos y activos siguen existiendo; solo deja de estar ligado a este documento.'}
      detail={relation?.label} confirmLabel="Quitar relación" loading={remove.isPending}
      confirmDisabled={impact.isLoading || impact.isError || blocked}>
      {impact.isError ? <p className="text-sm text-[hsl(var(--destructive))]">No se pudo revisar el impacto de quitar esta relación.</p> : null}
      {dependents.length ? (
        <div className="space-y-2">
          <p className="text-sm">Esta relación tiene {dependents.length} relación(es) derivada(s): {dependents.map((d) => d.label ?? d.relationType).join(', ')}.</p>
          <RadioGroupField name="dependents" value={mode} onChange={setMode} options={DEPENDENT_OPTIONS} />
        </div>
      ) : null}
      {!blocked && data ? (
        <TextareaField label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
      ) : null}
    </ConfirmDialog>
  )
}
