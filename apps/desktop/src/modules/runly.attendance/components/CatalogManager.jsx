import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, ComboboxField, ConfirmDialog, DataTable, SelectField, SwitchField, TextareaField, TextField } from '@runly/ui'
import { useCatalog, useDeleteCatalogItem, useSaveCatalogItem } from '../hooks/useAttendanceData.js'
import { WEEKDAYS } from '../lib/attendanceLabels.js'
import { CATALOGS, emptyForm, formFromItem, validateCatalogForm } from '../lib/catalogConfig.js'
import { FormSheet, toOptions, useCreateAnother } from './shared.jsx'

function CatalogField({ field, value, error, onChange, lookups }) {
  const common = { label: field.label, required: field.required, error }
  switch (field.type) {
    case 'textarea':
      return <TextareaField {...common} value={value} onChange={(e) => onChange(e.target.value)} />
    case 'select':
      return <SelectField {...common} options={field.options} value={value} onValueChange={onChange} />
    case 'ref':
      return <ComboboxField {...common} options={toOptions(lookups.rows[field.ref])} value={value} onChange={onChange} clearable placeholder="Cualquiera" />
    case 'days':
      return (
        <ComboboxField
          {...common} multiple options={WEEKDAYS} value={value} onChange={(next) => onChange([...(next ?? [])].map(Number).sort())}
          placeholder="Todos los días" hint="Déjalo vacío para aplicar todos los días."
        />
      )
    default:
      return <TextField {...common} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} inputMode={field.type === 'number' ? 'decimal' : undefined} />
  }
}

// Generic CRUD for one attendance catalog (sites, groups, categories, shifts, quotas).
export function CatalogManager({ kind, canConfigure, lookups }) {
  const config = CATALOGS[kind]
  const list = useCatalog(kind)
  const save = useSaveCatalogItem(kind)
  const remove = useDeleteCatalogItem(kind)
  const [editing, setEditing] = useState({ open: false, item: null })
  const [form, setForm] = useState(() => emptyForm(config))
  const [enabled, setEnabled] = useState(true)
  const [errors, setErrors] = useState({})
  const [toDelete, setToDelete] = useState(null)
  const another = useCreateAnother()

  useEffect(() => {
    if (!editing.open) return
    setErrors({})
    setForm(editing.item ? formFromItem(config, editing.item) : emptyForm(config))
    setEnabled(editing.item ? editing.item.enabled !== false : true)
  }, [editing, config])

  const columns = useMemo(() => [
    ...config.columns.map((col) => ({
      id: col.key, header: col.header,
      accessorFn: (row) => (col.render ? col.render(row, lookups) : (row[col.key] ?? '—')),
      cell: ({ row }) => {
        const text = col.render ? col.render(row.original, lookups) : (row.original[col.key] ?? '—')
        return col.key === 'name' || col.key === 'schedule' ? <span className="font-medium">{text}</span> : text
      },
    })),
    { id: 'enabled', header: 'Estado', accessorFn: (r) => (r.enabled === false ? 'Inactivo' : 'Activo'), cell: ({ row }) => <Badge variant={row.original.enabled === false ? 'secondary' : 'success'}>{row.original.enabled === false ? 'Inactivo' : 'Activo'}</Badge> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (canConfigure ? (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Editar" onClick={() => setEditing({ open: true, item: row.original })}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Eliminar" onClick={() => setToDelete(row.original)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ) : null),
    },
  ], [config, lookups, canConfigure])

  async function submit() {
    const result = validateCatalogForm(config, form)
    setErrors(result.errors)
    if (Object.keys(result.errors).length) return
    try {
      await save.mutateAsync({ id: editing.item?.id, ...result.payload, ...(editing.item ? { enabled } : {}) })
      another.finish({
        close: () => setEditing({ open: false, item: null }),
        reset: () => { setForm(emptyForm(config)); setErrors({}) },
      })
    } catch { /* toast shown */ }
  }

  async function confirmDelete() {
    try {
      const result = await remove.mutateAsync(toDelete.id)
      if (result?.disabled) toast.info(`El ${config.singular} está en uso: se desactivó en lugar de eliminarse.`)
      else toast.success('Eliminado.')
      setToDelete(null)
    } catch { /* toast shown */ }
  }

  return (
    <div>
      <DataTable
        columns={columns}
        data={list.data ?? []}
        getRowId={(r) => r.id}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => list.refetch()}
        pageSize={15}
        searchPlaceholder={`Buscar ${config.label.toLowerCase()}…`}
        toolbarActions={canConfigure ? <Button onClick={() => setEditing({ open: true, item: null })}><Plus className="h-4 w-4" />{config.newLabel}</Button> : null}
        emptyTitle={config.emptyTitle}
        emptyDescription={config.emptyDescription}
      />

      <FormSheet
        open={editing.open}
        onOpenChange={(open) => setEditing((e) => ({ ...e, open }))}
        title={editing.item ? `Editar ${config.singular}` : config.newLabel}
        createAnother={{ visible: !editing.item, checked: another.checked, onChange: another.setChecked }}
        bodyRef={another.bodyRef}
        footer={(
          <>
            <Button variant="outline" onClick={() => setEditing({ open: false, item: null })}>Cancelar</Button>
            <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Guardando…' : editing.item ? 'Guardar' : 'Crear'}</Button>
          </>
        )}
      >
        {config.fields.map((field) => (
          <CatalogField key={field.key} field={field} value={form[field.key]} error={errors[field.key]} lookups={lookups} onChange={(value) => setForm((f) => ({ ...f, [field.key]: value }))} />
        ))}
        {editing.item ? <SwitchField label="Activo" checked={enabled} onChange={setEnabled} /> : null}
      </FormSheet>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Eliminar ${config.singular}`}
        description="Si está en uso por personas, kioskos o checadas, se desactivará en lugar de eliminarse."
        detail={toDelete?.name}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
