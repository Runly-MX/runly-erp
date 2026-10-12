import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, ConfirmDialog, DataTable, SwitchField } from '@runly/ui'
import { useCatalog, useDeleteCatalogItem, useSaveCatalogItem } from '../hooks/useAttendanceData.js'
import { CATALOGS, emptyForm, formFromItem, validateCatalogForm } from '../lib/catalogConfig.js'
import CatalogFieldRenderer from './fields/CatalogFieldRenderer.jsx'
import { FormSheet, useCreateAnother } from './shared.jsx'

const VIEW_MODES = ['table', 'cards']

// Generic CRUD for one attendance catalog (sites, groups, categories, shifts, quotas).
export function CatalogManager({ kind, canConfigure, lookups, description }) {
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

  const cellText = (col, row) => (col.render ? col.render(row, lookups) : (row[col.key] ?? '—'))

  function renderCard(row) {
    const [titleCol, ...detailCols] = config.columns
    const inactive = row.enabled === false
    return (
      <div className="flex h-full flex-col gap-3 rounded-2xl surface-card p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate font-semibold">{cellText(titleCol, row)}</p>
          <Badge variant={inactive ? 'secondary' : 'success'}>{inactive ? 'Inactivo' : 'Activo'}</Badge>
        </div>
        <dl className="space-y-1 text-sm">
          {detailCols.map((col) => (
            <div key={col.key} className="flex justify-between gap-3">
              <dt className="shrink-0 text-[hsl(var(--muted-foreground))]">{col.header}</dt>
              <dd className="min-w-0 truncate text-right">{cellText(col, row)}</dd>
            </div>
          ))}
        </dl>
        {canConfigure ? (
          <div className="mt-auto flex justify-end gap-1">
            <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Editar" onClick={() => setEditing({ open: true, item: row })}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Eliminar" onClick={() => setToDelete(row)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ) : null}
      </div>
    )
  }

  async function submit() {
    const result = validateCatalogForm(config, form, lookups)
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
        viewModes={VIEW_MODES}
        viewStorageKey={`attendance-catalog-${kind}`}
        renderCard={renderCard}
        emptyTitle={list.data?.length ? 'Sin resultados' : config.emptyTitle}
        emptyDescription={list.data?.length ? 'Ningún registro coincide con la búsqueda.' : (description ?? config.emptyDescription)}
        emptyAction={canConfigure && !list.data?.length ? { label: config.newLabel, onClick: () => setEditing({ open: true, item: null }) } : undefined}
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
          <CatalogFieldRenderer key={field.key} field={field} value={form[field.key]} error={errors[field.key]} lookups={lookups} draft={form} onChange={(value) => setForm((f) => ({ ...f, [field.key]: value }))} />
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
