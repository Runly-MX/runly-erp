import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, ImageIcon, MinusCircle, RefreshCw, Sparkles } from 'lucide-react'
import { Badge, CheckboxField, DataTable, SegmentedControl, SelectField, cn } from '@runly/ui'
import { InventoryChangesDiff } from '../InventoryMatchPanel.jsx'
import { itemUrl } from '../InventoryIdentifierConflict.jsx'

const RESULT = {
  new: { label: 'Se crea', variant: 'success', icon: CheckCircle2 },
  update: { label: 'Actualizar', variant: 'warning', icon: RefreshCw },
  exists: { label: 'Sin cambios', variant: 'outline', icon: MinusCircle },
  error: { label: 'Con error', variant: 'destructive', icon: AlertTriangle },
}

function ItemCell({ data }) {
  const meta = [data.type, data.brand, data.model].filter(Boolean).join(' · ')
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">
        {data.name}
        {data.autoName ? <span className="ml-1.5 rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] font-normal text-[hsl(var(--muted-foreground))]">automático</span> : null}
      </p>
      {meta ? <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{meta}</p> : null}
    </div>
  )
}

function DetailCell({ row, updateExisting }) {
  if (row.status === 'update' || (row.status === 'exists' && row.existing)) {
    return (
      <div className="space-y-1.5">
        <a className="inline-flex items-center gap-1 text-xs font-medium underline" href={itemUrl(row.existing.id)} target="_blank" rel="noreferrer">
          {row.existing.name}{row.existing.assetTag ? ` · N.º ${row.existing.assetTag}` : ''}<ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
        {row.status === 'update'
          ? (updateExisting ? <InventoryChangesDiff changes={row.changes} incomingLabel="Archivo" /> : <p className="text-xs text-muted-foreground">No se actualizará (opción desactivada).</p>)
          : <p className="text-xs text-muted-foreground">Ya existe y no hay datos nuevos.</p>}
      </div>
    )
  }
  if (!row.errors.length && !row.notes.length) return <span className="text-xs text-[hsl(var(--muted-foreground))]">Listo</span>
  return (
    <ul className="space-y-0.5 text-xs">
      {row.errors.map((e) => <li key={e} className="text-destructive">{e}</li>)}
      {row.notes.map((n) => <li key={n} className="text-[hsl(var(--muted-foreground))]">{n}</li>)}
    </ul>
  )
}

const buildColumns = (updateExisting) => [
  { accessorKey: 'line', header: 'Fila', size: 60 },
  { id: 'result', header: 'Resultado', accessorFn: (r) => RESULT[r.status].label,
    cell: ({ row }) => <Badge variant={RESULT[row.original.status].variant}>{RESULT[row.original.status].label}</Badge> },
  { id: 'item', header: 'Activo', accessorFn: (r) => r.data?.name ?? '', cell: ({ row }) => <ItemCell data={row.original.data} /> },
  { id: 'ids', header: 'Serie / N.º de activo', accessorFn: (r) => r.data?.serialNumber || r.data?.assetTag || '',
    cell: ({ row }) => <span className="text-xs">{[row.original.data.serialNumber, row.original.data.assetTag].filter(Boolean).join(' · ') || '—'}</span> },
  { id: 'photos', header: 'Fotos', accessorFn: (r) => r.photoCount,
    cell: ({ row }) => row.original.photoCount ? <span className="inline-flex items-center gap-1 text-xs"><ImageIcon className="h-3.5 w-3.5" />{row.original.photoCount}</span> : <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span> },
  { id: 'detail', header: 'Detalle', enableSorting: false, cell: ({ row }) => <DetailCell row={row.original} updateExisting={updateExisting} /> },
]

// Step 3: what will happen, in order — the headline count, catalog entries to
// create, status spellings to resolve, then the per-row table filtered by
// result.
export function ImportPreviewStep({ preview, imageCounts, createMissing, onCreateMissingChange, statusMap, statuses, onStatusMapChange, updateExisting = true, onUpdateExistingChange, busy, canCreateCatalog = true }) {
  const [filter, setFilter] = useState('all')
  const rows = useMemo(() => preview.rows.map((row, i) => ({ ...row, photoCount: (imageCounts[i] ?? 0) + (row.data.photoUrls?.length ?? 0) })), [preview.rows, imageCounts])
  const columns = useMemo(() => buildColumns(updateExisting), [updateExisting])
  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter)
  const { counts } = preview
  const toCreate = [
    ...preview.missing.types.map((n) => ['Tipo', n]),
    ...preview.missing.brands.map((n) => ['Marca', n]),
    ...preview.missing.models.map((n) => ['Modelo', n]),
    ...preview.missing.locations.map((n) => ['Ubicación', n]),
    ...(preview.missing.conditions ?? []).map((n) => ['Condición', n]),
  ]
  const photos = rows.filter((r) => r.status === 'new').reduce((sum, r) => sum + r.photoCount, 0)
  const normalize = (v) => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.#°º]/g, '').replace(/\s+/g, '_')

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[hsl(var(--border))] p-4">
        <p className="text-2xl font-semibold tabular-nums text-[hsl(var(--foreground))]">
          {counts.new} {counts.new === 1 ? 'activo se creará' : 'activos se crearán'}
        </p>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {[
            counts.update ? `${counts.update} ${counts.update === 1 ? 'equipo existente se actualizará' : 'equipos existentes se actualizarán'}` : null,
            counts.exists ? `${counts.exists} ${counts.exists === 1 ? 'fila ya existe sin cambios' : 'filas ya existen sin cambios'}` : null,
            counts.error ? `${counts.error} ${counts.error === 1 ? 'fila tiene errores y no se importará' : 'filas tienen errores y no se importarán'}` : null,
            photos ? `${photos} ${photos === 1 ? 'foto se adjuntará' : 'fotos se adjuntarán'}` : null,
          ].filter(Boolean).join(' · ') || 'Todas las filas están listas.'}
        </p>
      </div>

      {counts.update > 0 ? (
        <section className="space-y-2 rounded-2xl border border-[hsl(var(--border))] p-4">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">Estos equipos ya existen en tu inventario</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">No se crean duplicados. Se actualizan solo los campos con datos nuevos del archivo; nunca se borran valores existentes ni se cambian la serie o el número de activo.</p>
          <CheckboxField label={`Actualizar los ${counts.update} ${counts.update === 1 ? 'equipo existente' : 'equipos existentes'}`} checked={updateExisting} disabled={busy}
            onChange={(e) => onUpdateExistingChange?.(e.target.checked)} />
        </section>
      ) : null}

      {preview.unknownStatuses.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">¿A qué estado corresponde cada valor de tu archivo?</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">«Asignado» no se importa como tal: la asignación se hace desde la ficha del activo. Las bajas tampoco: se proponen desde la ficha.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {preview.unknownStatuses.map((raw) => (
              <SelectField key={raw} label={`«${raw}»`} value={statusMap[normalize(raw)] ?? ''} placeholder="Elegir estado" disabled={busy}
                options={statuses} onValueChange={(v) => onStatusMapChange({ ...statusMap, [normalize(raw)]: v })} />
            ))}
          </div>
        </section>
      ) : null}

      {toCreate.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-[hsl(var(--border))] p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
            <Sparkles className="h-4 w-4 text-(--brand-primary)" />
            No existen en tus catálogos
          </div>
          <div className="flex flex-wrap gap-1.5">
            {toCreate.slice(0, 12).map(([kind, name]) => (
              <span key={`${kind}-${name}`} className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 text-xs">
                <span className="text-[hsl(var(--muted-foreground))]">{kind}:</span> {name}
              </span>
            ))}
            {toCreate.length > 12 ? <span className="px-1 py-1 text-xs text-[hsl(var(--muted-foreground))]">y {toCreate.length - 12} más</span> : null}
          </div>
          <CheckboxField label="Crearlos al importar y relacionarlos con los activos" checked={createMissing && canCreateCatalog} disabled={busy || !canCreateCatalog}
            onChange={(e) => onCreateMissingChange(e.target.checked)} />
          {!createMissing || !canCreateCatalog ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{canCreateCatalog ? 'Sin esta opción, las filas que los usan no se importan.' : 'No tienes permiso para crear catálogos: las filas que los usan no se importan.'}</p> : null}
        </section>
      ) : null}

      <div className="space-y-2">
        <SegmentedControl ariaLabel="Filtrar filas" value={filter} onChange={setFilter} className="w-auto"
          options={[
            { value: 'all', label: `Todas (${rows.length})` },
            { value: 'new', label: `Se crean (${counts.new})` },
            { value: 'update', label: `Se actualizan (${counts.update})` },
            { value: 'exists', label: `Sin cambios (${counts.exists})` },
            { value: 'error', label: `Con error (${counts.error})` },
          ]} />
        <div className={cn(busy && 'pointer-events-none opacity-60')}>
          <DataTable columns={columns} data={visible} pageSize={10} getRowId={(row) => String(row.line)} searchPlaceholder="Buscar por nombre, serie o detalle..."
            emptyTitle="Sin filas en este filtro" />
        </div>
      </div>
    </div>
  )
}
