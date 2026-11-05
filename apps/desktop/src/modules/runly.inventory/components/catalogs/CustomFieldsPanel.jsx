import { useEffect, useState } from 'react'
import { Button, CheckboxField, EmptyState, LoadingState, SelectField, SortableList, TextField, resolveLucideIcon } from '@runly/ui'
import { PackageCheck, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  useInventoryCustomFields, useCreateInventoryCustomField, useUpdateInventoryCustomField, useDeleteInventoryCustomField, useReorderInventoryCustomFields,
} from '../../hooks/useInventoryCatalogs.js'
import { useTypeRows } from '../InventoryCatalogPickers.jsx'
import { CatalogPanel } from './CatalogPanel.jsx'
import { CatalogListRow } from './CatalogListRow.jsx'
import { CatalogPager, usePagedList } from './CatalogPager.jsx'
import { ActiveFilterChip, useCatalogUrlFilter } from './CatalogCountLink.jsx'
import { CatalogEditSheet } from './CatalogEditSheet.jsx'
import { CustomFieldItemsSheet } from './CustomFieldItemsSheet.jsx'

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' }, { value: 'textarea', label: 'Texto largo' }, { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' }, { value: 'boolean', label: 'Sí/No' }, { value: 'select', label: 'Lista de opciones' },
  { value: 'url', label: 'URL' }, { value: 'email', label: 'Email' },
]
// Where a field shows up: only on the assets it is added to (default), on every type, or on the chosen types.
const SCOPES = [
  { value: 'onDemand', label: 'Solo en los activos seleccionados' },
  { value: 'all', label: 'En todos los tipos' },
  { value: 'types', label: 'En los tipos que elijas' },
]
const SCOPE_HINTS = {
  onDemand: 'No se pide automáticamente. Agrégalo a cada activo desde su formulario o en grupo con el botón Activos.',
  all: 'Se pide al registrar cualquier activo.',
  types: 'Se pide al registrar activos de los tipos marcados.',
}
const EMPTY = { label: '', fieldKey: '', fieldType: 'text', scope: 'onDemand', categoryIds: [], optionsText: '' }
const toOptionsText = (options) => (Array.isArray(options) ? options.map((o) => (typeof o === 'string' ? o : o?.label ?? o?.value)).join(', ') : '')
const scopeOf = (row) => (row.onDemand ? 'onDemand' : row.categoryIds?.length ? 'types' : 'all')

export function CustomFieldsPanel() {
  const { data, isLoading } = useInventoryCustomFields('all')
  const rows = (data?.data ?? data ?? []).filter((row) => row.enabled !== false)
  const types = useTypeRows()
  const typeById = new Map(types.map((type) => [type.id, type]))
  const create = useCreateInventoryCustomField()
  const update = useUpdateInventoryCustomField()
  const remove = useDeleteInventoryCustomField()
  const reorder = useReorderInventoryCustomFields()
  const [order, setOrder] = useState(null)
  const [editing, setEditing] = useState(null)
  const [itemsOf, setItemsOf] = useState(null)
  const [form, setForm] = useState(EMPTY)
  useEffect(() => { setOrder(null) }, [data])
  const [typeFilter, clearTypeFilter] = useCatalogUrlFilter('typeId')
  const listed = typeFilter ? rows.filter((row) => row.categoryIds?.includes(typeFilter)) : (order ?? rows)
  const paged = usePagedList(listed)

  function open(row) {
    setEditing(row ?? {})
    setForm(row ? { label: row.label, fieldKey: row.fieldKey, fieldType: row.fieldType, scope: scopeOf(row), categoryIds: row.categoryIds ?? [], optionsText: toOptionsText(row.options) } : EMPTY)
  }
  async function save() {
    const { optionsText, scope, categoryIds, ...rest } = form
    const options = optionsText.split(/[,\n]/).map((o) => o.trim()).filter(Boolean)
    const payload = { ...rest, onDemand: scope === 'onDemand', categoryIds: scope === 'types' ? categoryIds : [], ...(form.fieldType === 'select' ? { options } : {}) }
    try {
      if (editing?.id) { await update.mutateAsync({ id: editing.id, ...payload }); toast.success('Campo actualizado') }
      else { await create.mutateAsync(payload); toast.success('Campo creado') }
      setEditing(null)
    } catch (err) { toast.error(err?.message ?? 'No se pudo guardar el campo') }
  }
  function handleReorder(next) {
    setOrder(next)
    reorder.mutate(next.map((row, index) => ({ id: row.id, sortOrder: index * 10 })))
  }
  const toggleType = (id, on) => setForm((f) => ({ ...f, categoryIds: on ? [...new Set([...f.categoryIds, id])] : f.categoryIds.filter((v) => v !== id) }))

  const fieldTypeLabel = (value) => FIELD_TYPES.find((t) => t.value === value)?.label ?? value
  const scopeLabel = (row) => {
    if (row.onDemand) return 'A demanda'
    const names = (row.categoryIds ?? []).map((id) => typeById.get(id)?.name).filter(Boolean)
    return names.length ? names.join(', ') : 'Todos los tipos'
  }

  return (
    <CatalogPanel catalogKey="custom-fields" createLabel="Nuevo campo" onCreate={() => open(null)}>
      {isLoading ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title="Sin campos" description="Crea campos para los activos que los necesiten o para tipos completos." action={{ label: 'Nuevo campo', onClick: () => open(null) }} />
      ) : (
        <div className="space-y-1.5">
          {typeFilter ? <ActiveFilterChip label={`Tipo: ${typeById.get(typeFilter)?.name ?? '...'}`} onClear={clearTypeFilter} /> : null}
          <SortableList
            items={paged.pageItems}
            onReorder={(next) => { if (!typeFilter) handleReorder(paged.replacePage(next)) }}
            renderItem={(row, { dragHandleProps, isDragging }) => {
              const type = row.categoryIds?.length === 1 ? typeById.get(row.categoryIds[0]) : null
              return (
                <CatalogListRow
                  icon={(type && resolveLucideIcon(type.icon)) || SlidersHorizontal}
                  color={type?.color ?? '#475569'}
                  title={row.label}
                  subtitle={`${scopeLabel(row)} · ${row.fieldKey}`}
                  badges={[fieldTypeLabel(row.fieldType), ...(row.required ? ['Obligatorio'] : [])]}
                  actions={(
                    <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setItemsOf(row)} aria-label={`Activos con ${row.label}`}>
                      <PackageCheck className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Activos</span>
                    </Button>
                  )}
                  dragHandleProps={dragHandleProps}
                  isDragging={isDragging}
                  onEdit={() => open(row)}
                  onDelete={() => remove.mutateAsync(row.id).then(() => toast.success('Campo eliminado')).catch((err) => toast.error(err.message))}
                />
              )
            }}
          />
          <CatalogPager {...paged} />
        </div>
      )}
      <CatalogEditSheet open={Boolean(editing)} onOpenChange={(value) => { if (!value) setEditing(null) }}
        title={editing?.id ? 'Editar campo' : 'Nuevo campo personalizado'} busy={create.isPending || update.isPending}
        saveDisabled={!form.label.trim() || !form.fieldKey.trim() || (form.fieldType === 'select' && !form.optionsText.trim()) || (form.scope === 'types' && !form.categoryIds.length)} onSave={save}>
        <TextField label="Nombre del campo" required value={form.label} placeholder="Memoria RAM" onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        <TextField label="Clave" value={form.fieldKey} placeholder="memoria_ram" hint="Solo letras minúsculas, números y guiones bajos"
          disabled={Boolean(editing?.id)} onChange={(e) => setForm((f) => ({ ...f, fieldKey: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} />
        <SelectField label="Tipo de campo" value={form.fieldType} onValueChange={(fieldType) => setForm((f) => ({ ...f, fieldType }))} options={FIELD_TYPES} />
        {form.fieldType === 'select' ? (
          <TextField label="Opciones" required value={form.optionsText} placeholder="8 GB, 16 GB, 32 GB" hint="Sepáralas con comas."
            onChange={(e) => setForm((f) => ({ ...f, optionsText: e.target.value }))} />
        ) : null}
        <SelectField label="Dónde aparece" value={form.scope} onValueChange={(scope) => setForm((f) => ({ ...f, scope }))} hint={SCOPE_HINTS[form.scope]} options={SCOPES} />
        {form.scope === 'types' ? (
          <fieldset className="space-y-1 rounded-md border border-[hsl(var(--border))] p-3">
            <legend className="px-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">Tipos ({form.categoryIds.length})</legend>
            {types.map((type) => (
              <CheckboxField key={type.id} label={type.name} checked={form.categoryIds.includes(type.id)} onChange={(e) => toggleType(type.id, e.target.checked)} />
            ))}
          </fieldset>
        ) : null}
      </CatalogEditSheet>
      <CustomFieldItemsSheet field={itemsOf} types={types} onOpenChange={(value) => { if (!value) setItemsOf(null) }} />
    </CatalogPanel>
  )
}
