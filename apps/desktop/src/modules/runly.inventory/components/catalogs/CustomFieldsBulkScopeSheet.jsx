import { useEffect, useState } from 'react'
import { CheckboxField } from '@runly/ui'
import { toast } from 'sonner'
import { useBulkUpdateInventoryCustomFields } from '../../hooks/useInventoryCatalogs.js'
import { CatalogEditSheet } from './CatalogEditSheet.jsx'
import { CustomFieldScopeFields, scopeOf, scopePayload } from './CustomFieldScope.jsx'

// Starting point: the scope every selected field shares (else "types") and the types common to all of them.
function initialValue(fields) {
  const scopes = new Set(fields.map(scopeOf))
  const scope = scopes.size === 1 ? [...scopes][0] : 'types'
  const typed = fields.filter((field) => field.categoryIds?.length)
  const common = typed.length === fields.length && typed.length
    ? typed[0].categoryIds.filter((id) => typed.every((field) => field.categoryIds.includes(id)))
    : []
  return { scope, categoryIds: common }
}

// Catálogos > Campos: one "Dónde aparece" applied to every selected field.
// With "Sumar", the chosen types are added to the ones each field already has.
export function CustomFieldsBulkScopeSheet({ fields, types, scopeLabel, onOpenChange, onDone }) {
  const open = fields.length > 0
  const save = useBulkUpdateInventoryCustomFields()
  const [value, setValue] = useState(() => initialValue(fields))
  const [merge, setMerge] = useState(false)
  useEffect(() => { if (open) { setValue(initialValue(fields)); setMerge(false) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div>
        <p className="mb-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">Dónde aparecen ahora</p>
        <ul className="max-h-48 divide-y divide-[hsl(var(--border)/0.6)] overflow-y-auto rounded-md border border-[hsl(var(--border))]">
          {fields.map((field) => (
            <li key={field.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate font-medium">{field.label}</span>
              <span className="min-w-0 truncate text-right text-xs text-[hsl(var(--muted-foreground))]" title={scopeLabel(field)}>{scopeLabel(field)}</span>
            </li>
          ))}
        </ul>
      </div>
      <CustomFieldScopeFields value={value} onChange={setValue} types={types} />
      {value.scope === 'types' ? (
        <CheckboxField label="Sumar a los tipos que ya tiene cada campo" checked={merge} onChange={(e) => setMerge(e.target.checked)}
          hint={merge ? 'Los tipos actuales se conservan.' : 'Los tipos actuales se reemplazan por los elegidos.'} />
      ) : null}
    </CatalogEditSheet>
  )
}
