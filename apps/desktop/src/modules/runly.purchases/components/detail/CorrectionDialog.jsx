import { useEffect, useMemo, useState } from 'react'
import { PencilLine } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button, DateField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField, TextareaField } from '@runly/ui'
import { errorText, useCorrectDocument } from '../../hooks/usePurchases.js'
import { formatDate } from '../../lib/format.js'
import { DOCUMENTARY_FIELD_META, documentLabel, isDocumentaryDoc } from '../../lib/documentary.js'
import { SupplierField } from '../SupplierField.jsx'

const show = (field, value, names = {}) => (value == null || value === '' ? 'Sin dato'
  : field.type === 'date' ? formatDate(value) : field.type === 'supplier' ? names[value] ?? 'Proveedor seleccionado' : String(value))

// Administrative correction of a registered order or invoice: only the fields
// the API allows in this status (doc.correction.fields), a review of the
// changes, and a required reason. Saved as a revision with before/after.
export function CorrectionDialog({ kind, doc, open, onOpenChange }) {
  const correct = useCorrectDocument(kind, doc?.id)
  const client = useQueryClient()
  const documentary = isDocumentaryDoc(doc)
  // Documentary plans carry { field, value } only: labels and inputs come from DOCUMENTARY_FIELD_META.
  const fields = useMemo(() => (doc?.correction?.fields ?? []).map((f) => (documentary ? { ...DOCUMENTARY_FIELD_META[f.field], ...f, value: f.field.endsWith('Date') && f.value ? String(f.value).slice(0, 10) : f.value } : f)), [doc?.correction?.fields, documentary])
  const [values, setValues] = useState({})
  const [reason, setReason] = useState('')
  const [step, setStep] = useState('edit')
  const [stale, setStale] = useState(false)
  const [names, setNames] = useState({})
  // Reset only when the dialog opens: a reload after a conflict keeps what was typed.
  useEffect(() => {
    if (!open) return
    setValues(Object.fromEntries(fields.map((f) => [f.field, f.value ?? ''])))
    setNames(doc?.supplierId ? { [doc.supplierId]: doc.supplierName ?? doc.supplier?.name } : {})
    setReason('')
    setStep('edit')
    setStale(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const reload = async () => {
    await client.invalidateQueries({ queryKey: ['purchases', kind, 'detail', doc.id] })
    setStale(false)
  }

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
      if (code === 'STALE_DOCUMENT') { setStale(true); toast.error('Otra persona cambió este documento mientras lo corregías.') }
      else if (code === 'DUPLICATE_NUMBER') { toast.error(errorText(error, 'Ese folio ya existe.')); setStep('edit') }
      else toast.error(errorText(error, 'No se pudo guardar la corrección.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader className="shrink-0" icon={PencilLine}>
          <DialogTitle>{documentary ? `Completar o corregir ${documentLabel(doc)}` : `Corregir datos de ${doc?.number}`}</DialogTitle>
          <DialogDescription>
            {step === 'edit'
              ? (documentary ? 'Completa o corrige los datos de la referencia. Cada cambio pide un motivo y queda en el historial.' : 'Solo los datos administrativos que se pueden corregir en este estado. Importes, partidas, proveedor y UUID fiscal no cambian aquí.')
              : 'Revisa los cambios y explica el motivo; quedan en el historial del documento.'}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          {stale ? (
            <div role="alert" className="flex flex-wrap items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
              <span className="min-w-0 flex-1">Otra persona cambió este documento. Lo que capturaste sigue aquí: recarga la versión actual, revisa y vuelve a guardar.</span>
              <Button type="button" size="sm" variant="outline" onClick={reload}><RefreshCw className="h-4 w-4" />Recargar versión actual</Button>
            </div>
          ) : null}
          {step === 'edit' ? (
            <>
              {fields.map((f) => {
                const set = (value) => setValues((current) => ({ ...current, [f.field]: value }))
                if (f.type === 'supplier') {
                  return <SupplierField key={f.field} id={`correction-${f.field}`} label={f.label} value={values[f.field] || null}
                    selected={doc?.supplier ?? null} onChange={(id, row) => { set(id ?? ''); if (id) setNames((n) => ({ ...n, [id]: row?.name })) }} />
                }
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
                    <span className="block text-[hsl(var(--muted-foreground))] line-through">{show(c, c.value, names)}</span>
                    <span className="block">{show(c, c.after, names)}</span>
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
