import { useEffect, useState } from 'react'
import { Button, Checkbox, EmptyState, LoadingState, SelectField, SortableList, TextField, resolveLucideIcon } from '@runly/ui'
import { PackageCheck, SlidersHorizontal, X } from 'lucide-react'
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
import { CustomFieldScopeFields, scopeLabelOf, scopeOf, scopePayload } from './CustomFieldScope.jsx'
import { CustomFieldsBulkScopeSheet } from './CustomFieldsBulkScopeSheet.jsx'

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' }, { value: 'textarea', label: 'Texto largo' }, { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' }, { value: 'boolean', label: 'Sí/No' }, { value: 'select', label: 'Lista de opciones' },
  { value: 'url', label: 'URL' }, { value: 'email', label: 'Email' },
]
const EMPTY = { label: '', fieldKey: '', fieldType: 'text', scope: 'onDemand', categoryIds: [], optionsText: '' }
const toOptionsText = (options) => (Array.isArray(options) ? options.map((o) => (typeof o === 'string' ? o : o?.label ?? o?.value)).join(', ') : '')

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
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  useEffect(() => { setOrder(null) }, [data])
  const [typeFilter, clearTypeFilter] = useCatalogUrlFilter('typeId')
  const listed = typeFilter ? rows.filter((row) => row.categoryIds?.includes(typeFilter)) : (order ?? rows)
  const paged = usePagedList(listed)
  const selectedRows = rows.filter((row) => selectedIds.has(row.id))
  const allListedSelected = listed.length > 0 && listed.every((row) => selectedIds.has(row.id))
  const select = (ids, on) => setSelectedIds((prev) => {
    const next = new Set(prev)
    for (const id of ids) { if (on) next.add(id); else next.delete(id) }
    return next
  })

  function open(row) {
    setEditing(row ?? {})
    setForm(row ? { label: row.label, fieldKey: row.fieldKey, fieldType: row.fieldType, scope: scopeOf(row), categoryIds: row.categoryIds ?? [], optionsText: toOptionsText(row.options) } : EMPTY)
  }
  async function save() {
    const { optionsText, scope, categoryIds, ...rest } = form
    const options = optionsText.split(/[,\n]/).map((o) => o.trim()).filter(Boolean)
    const payload = { ...rest, ...scopePayload({ scope, categoryIds }), ...(form.fieldType === 'select' ? { options } : {}) }
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

  const fieldTypeLabel = (value) => FIELD_TYPES.find((t) => t.value === value)?.label ?? value
  const scopeLabel = (row) => scopeLabelOf(row, typeById)
  // "A demanda (2) · Laptop, Monitor (1)": where the selected fields appear today.
  const selectionScope = [...selectedRows.reduce((acc, row) => acc.set(scopeLabel(row), (acc.get(scopeLabel(row)) ?? 0) + 1), new Map())]
    .map(([label, count]) => `${label} (${count})`).join(' · ')

  return (
    <CatalogPanel catalogKey="custom-fields" createLabel="Nuevo campo" onCreate={() => open(null)}>
      {isLoading ? <LoadingState /> : rows.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title="Sin campos" description="Crea campos para los activos que los necesiten o para tipos completos." action={{ label: 'Nuevo campo', onClick: () => open(null) }} />
      ) : (
        <div className="space-y-1.5">
          {typeFilter ? <ActiveFilterChip label={`Tipo: ${typeById.get(typeFilter)?.name ?? '...'}`} onClear={clearTypeFilter} /> : null}
          <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-[hsl(var(--muted)/0.35)] px-3 py-1.5 text-sm">
            <label className="flex min-h-9 cursor-pointer items-center gap-2.5">
              <Checkbox className="size-5" checked={allListedSelected} onCheckedChange={(v) => select(listed.map((row) => row.id), Boolean(v))} aria-label="Seleccionar todos los campos" />
              <span className="text-[hsl(var(--muted-foreground))]">{selectedRows.length ? `${selectedRows.length} seleccionados` : 'Seleccionar todos'}</span>
            </label>
            {selectedRows.length ? <span className="min-w-0 truncate text-xs text-[hsl(var(--muted-foreground))]" title={selectionScope}>Aparecen en: {selectionScope}</span> : null}
            {selectedRows.length ? (
              <div className="ml-auto flex items-center gap-1">
                <Button type="button" size="sm" className="h-9" onClick={() => setBulkOpen(true)}>Definir dónde aparecen</Button>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Quitar selección" onClick={() => setSelectedIds(new Set())}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
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
                  selected={selectedIds.has(row.id)}
                  onSelect={(on) => select([row.id], on)}
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
        <CustomFieldScopeFields value={form} onChange={(next) => setForm((f) => ({ ...f, scope: next.scope, categoryIds: next.categoryIds }))} types={types} />
      </CatalogEditSheet>
      <CustomFieldsBulkScopeSheet fields={bulkOpen ? selectedRows : []} types={types} scopeLabel={scopeLabel}
        onOpenChange={(value) => { if (!value) setBulkOpen(false) }} onDone={() => { setBulkOpen(false); setSelectedIds(new Set()) }} />
      <CustomFieldItemsSheet field={itemsOf} types={types} onOpenChange={(value) => { if (!value) setItemsOf(null) }} />
    </CatalogPanel>
  )
}
