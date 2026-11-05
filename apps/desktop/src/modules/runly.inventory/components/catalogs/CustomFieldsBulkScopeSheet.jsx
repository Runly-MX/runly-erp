import { useEffect, useState } from 'react'
import { CheckboxField } from '@runly/ui'
import { toast } from 'sonner'
import { useBulkUpdateInventoryCustomFields } from '../../hooks/useInventoryCatalogs.js'
import { CatalogEditSheet } from './CatalogEditSheet.jsx'
import { CustomFieldScopeFields, scopePayload } from './CustomFieldScope.jsx'

const INITIAL = { scope: 'types', categoryIds: [] }

// Catálogos > Campos: one "Dónde aparece" applied to every selected field.
// With "Sumar", the marked types are added to the ones each field already has.
export function CustomFieldsBulkScopeSheet({ fields, types, onOpenChange, onDone }) {
  const open = fields.length > 0
  const save = useBulkUpdateInventoryCustomFields()
  const [value, setValue] = useState(INITIAL)
  const [merge, setMerge] = useState(false)
  useEffect(() => { if (open) { setValue(INITIAL); setMerge(false) } }, [open])

  async function submit() {
    const rows = fields.map((field) => {
      const payload = scopePayload(value)
      if (merge && value.scope === 'types' && !field.onDemand) payload.categoryIds = [...new Set([...(field.categoryIds ?? []), ...payload.categoryIds])]
      return { id: field.id, ...payload }
    })
    try {
      await save.mutateAsync(rows)
      toast.success(`${rows.length} ${rows.length === 1 ? 'campo actualizado' : 'campos actualizados'}`)
      onDone()
    } catch (err) {
      toast.error(err?.message ?? 'No se pudieron actualizar los campos')
    }
  }

  return (
    <CatalogEditSheet open={open} onOpenChange={onOpenChange} title={`Dónde aparecen ${fields.length} ${fields.length === 1 ? 'campo' : 'campos'}`}
      busy={save.isPending} saveDisabled={value.scope === 'types' && !value.categoryIds.length} onSave={submit}>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{fields.map((field) => field.label).join(', ')}</p>
      <CustomFieldScopeFields value={value} onChange={setValue} types={types} />
      {value.scope === 'types' ? (
        <CheckboxField label="Sumar a los tipos que ya tiene cada campo" checked={merge} onChange={(e) => setMerge(e.target.checked)}
          hint={merge ? 'Los tipos actuales se conservan.' : 'Los tipos actuales se reemplazan por los marcados.'} />
      ) : null}
    </CatalogEditSheet>
  )
}
