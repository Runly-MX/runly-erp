import { useEffect, useMemo, useState } from 'react'
import { PencilLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button, DateField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField, TextareaField } from '@runly/ui'
import { errorText, useCorrectDocument } from '../../hooks/usePurchases.js'
import { formatDate } from '../../lib/format.js'

const show = (field, value) => (value == null || value === '' ? 'Sin dato' : field.type === 'date' ? formatDate(value) : String(value))

// Administrative correction of a registered order or invoice: only the fields
// the API allows in this status (doc.correction.fields), a review of the
// changes, and a required reason. Saved as a revision with before/after.
export function CorrectionDialog({ kind, doc, open, onOpenChange }) {
  const correct = useCorrectDocument(kind, doc?.id)
  const fields = useMemo(() => doc?.correction?.fields ?? [], [doc?.correction?.fields])
  const [values, setValues] = useState({})
  const [reason, setReason] = useState('')
  const [step, setStep] = useState('edit')
  useEffect(() => {
    if (!open) return
    setValues(Object.fromEntries(fields.map((f) => [f.field, f.value ?? ''])))
    setReason('')
    setStep('edit')
  }, [open, fields])

  const changes = fields
    .filter((f) => String(values[f.field] ?? '').trim() !== String(f.value ?? ''))
    .map((f) => ({ ...f, after: String(values[f.field] ?? '').trim() || null }))

  const save = async () => {
    try {
      await correct.mutateAsync({
        changes: Object.fromEntries(changes.map((c) => [c.field, c.after])),
        reason: reason.trim(), expectedVersion: doc.version ?? undefined, expectedUpdatedAt: doc.updatedAt,
      })
      toast.success('Corrección guardada en el historial')
      onOpenChange(false)
    } catch (error) {
      const code = error?.details?.code
      if (code === 'STALE_DOCUMENT') toast.error('Otra persona cambió este documento mientras lo corregías. Cierra y vuelve a abrir la corrección con la versión actual.')
      else if (code === 'DUPLICATE_NUMBER') { toast.error(errorText(error, 'Ese folio ya existe.')); setStep('edit') }
      else toast.error(errorText(error, 'No se pudo guardar la corrección.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader className="shrink-0" icon={PencilLine}>
          <DialogTitle>Corregir datos de {doc?.number}</DialogTitle>
          <DialogDescription>
            {step === 'edit' ? 'Solo los datos administrativos que se pueden corregir en este estado. Importes, partidas, proveedor y UUID fiscal no cambian aquí.' : 'Revisa los cambios y explica el motivo; quedan en el historial del documento.'}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          {step === 'edit' ? (
            <>
              {fields.map((f) => {
                const set = (value) => setValues((current) => ({ ...current, [f.field]: value }))
                if (f.type === 'date') return <DateField key={f.field} id={`correction-${f.field}`} label={f.label} hint={f.note ?? undefined} value={values[f.field] ?? ''} onChange={(e) => set(e.target.value)} />
                if (f.type === 'textarea') return <TextareaField key={f.field} id={`correction-${f.field}`} label={f.label} rows={3} maxLength={f.max ?? undefined} value={values[f.field] ?? ''} onChange={(e) => set(e.target.value)} />
                return <TextField key={f.field} id={`correction-${f.field}`} label={f.label} hint={f.note ?? undefined} maxLength={f.max ?? undefined} value={values[f.field] ?? ''} onChange={(e) => set(e.target.value)} />
              })}
              {doc?.correction?.locked?.length ? (
                <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <p className="font-medium">No se corrigen en este estado:</p>
                  <ul className="mt-1 list-disc pl-4">{doc.correction.locked.map((l) => <li key={l.field}>{l.label}: {l.reason}</li>)}</ul>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))]" aria-label="Cambios a guardar">
                {changes.map((c) => (
                  <li key={c.field} className="px-3 py-2 text-sm">
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-[hsl(var(--muted-foreground))] line-through">{show(c, c.value)}</span>
                    <span className="block">{show(c, c.after)}</span>
                  </li>
                ))}
              </ul>
              <TextareaField id="correction-reason" label="Motivo" required rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por qué se corrige (queda en el historial)." />
            </>
          )}
        </div>
        <DialogFooter className="shrink-0">
          {step === 'edit' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button disabled={!changes.length} onClick={() => setStep('review')}>Revisar cambios</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('edit')}>Volver</Button>
              <Button disabled={correct.isPending || !reason.trim()} onClick={save}>{correct.isPending ? 'Guardando...' : 'Guardar corrección'}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
