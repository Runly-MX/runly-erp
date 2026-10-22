import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Skeleton } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { runly } from '../../../lib/runly.js'
import { saveBlob } from '../lib/save-blob.js'

const STORAGE_KEY = 'runly.inventory.export.columns'
const FORMATS = [
  { value: 'xlsx', label: 'Excel (.xlsx)', hint: 'Columnas con formato, filtros y encabezado fijo', icon: FileSpreadsheet },
  { value: 'csv', label: 'CSV (.csv)', hint: 'Texto plano, compatible con cualquier sistema', icon: FileText },
]

// Last choice of columns on this browser; columns added later start with their default.
function loadSelection(catalog) {
  const defaults = catalog.columns.filter((c) => c.default).map((c) => c.key)
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!saved) return new Set(defaults)
    const known = new Set(saved.known ?? [])
    const valid = new Set(catalog.columns.map((c) => c.key))
    return new Set([...(saved.selected ?? []).filter((k) => valid.has(k)), ...defaults.filter((k) => !known.has(k))])
  } catch { return new Set(defaults) }
}
function saveSelection(selected, catalog) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected: [...selected], known: catalog.columns.map((c) => c.key) })) } catch { /* storage unavailable */ }
}

// Exporter of the inventory list: format, which items (the selection or every
// match of the current filters) and which columns, relations included.
// `context` = { selectedIds, search, filters, total } as reported by the table.
export function InventoryExportDialog({ open, onOpenChange, context }) {
  const { session } = useAuth()
  const token = session?.access_token
  const { activeCompanyId } = useActiveCompany()
  const selectedCount = context?.selectedIds?.length ?? 0
  const [format, setFormat] = useState('xlsx')
  const [scope, setScope] = useState('filtered')
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)

  const catalogQuery = useQuery({
    queryKey: ['inventory', 'export-columns', activeCompanyId],
    queryFn: () => runly.inventory.getExportColumns(token).then((res) => res?.data ?? res),
    enabled: Boolean(token) && open,
    staleTime: 60 * 1000,
  })
  const catalog = catalogQuery.data

  useEffect(() => {
    if (open) setScope(selectedCount ? 'selected' : 'filtered')
  }, [open, selectedCount])
  useEffect(() => { if (open && catalog) setSelected(loadSelection(catalog)) }, [open, catalog])

  const grouped = useMemo(() => (catalog?.groups ?? [])
    .map((group) => ({ ...group, columns: catalog.columns.filter((c) => c.group === group.key) }))
    .filter((group) => group.columns.length), [catalog])

  const toggle = (key) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const setGroup = (columns, on) => setSelected((current) => {
    const next = new Set(current)
    for (const col of columns) { if (on) next.add(col.key); else next.delete(col.key) }
    return next
  })

  const count = scope === 'selected' ? selectedCount : (context?.total ?? 0)

  async function submit() {
    setBusy(true)
    try {
      const keys = catalog.columns.filter((c) => selected.has(c.key)).map((c) => c.key)
      const body = {
        format, columns: keys,
        ...(scope === 'selected' ? { ids: context.selectedIds } : { search: context?.search ?? '', filters: context?.filters ?? {} }),
      }
      const res = await fetch(`${getApiUrl()}/inventory/export/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': activeCompanyId },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'No se pudo exportar el inventario.')
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `inventario.${format}`
      saveBlob(await res.blob(), name)
      saveSelection(selected, catalog)
      toast.success(`${res.headers.get('X-Export-Count') ?? ''} activos exportados`.trim())
      onOpenChange(false)
    } catch (err) { toast.error(err?.message ?? 'No se pudo exportar el inventario.') }
    finally { setBusy(false) }
  }

  const hasImages = selected.has('images') || selected.has('coverImage')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg">
        <DialogHeader icon={FileSpreadsheet}>
          <DialogTitle>Exportar inventario</DialogTitle>
          <DialogDescription>Elige el formato, qué activos y qué columnas incluir.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-0.5">
          <section className="space-y-2">
            <p className="text-sm font-medium">Formato</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {FORMATS.map(({ value, label, hint, icon: Icon }) => (
                <button key={value} type="button" onClick={() => setFormat(value)} aria-pressed={format === value}
                  className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors pointer-coarse:min-h-11 ${format === value ? 'border-(--brand-primary) bg-(--brand-soft)' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'}`}>
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                  <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-[hsl(var(--muted-foreground))]">{hint}</span></span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium">Activos a exportar</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant={scope === 'filtered' ? 'default' : 'outline'} onClick={() => setScope('filtered')}>
                Todos los de la lista actual ({context?.total ?? 0})
              </Button>
              {selectedCount ? (
                <Button type="button" variant={scope === 'selected' ? 'default' : 'outline'} onClick={() => setScope('selected')}>
                  Solo los seleccionados ({selectedCount})
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">La lista actual respeta la búsqueda y los filtros que tengas aplicados. Máximo {catalog?.maxRows?.toLocaleString('es-MX') ?? '20,000'} activos por archivo.</p>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Columnas <span className="font-normal text-[hsl(var(--muted-foreground))]">({selected.size} de {catalog?.columns.length ?? 0})</span></p>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set(catalog.columns.map((c) => c.key)))} disabled={!catalog}>Todas</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set(catalog.columns.filter((c) => c.default).map((c) => c.key)))} disabled={!catalog}>Predeterminadas</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={!catalog}>Ninguna</Button>
              </div>
            </div>
            {catalogQuery.isLoading ? <Skeleton className="h-40 w-full" /> : catalogQuery.isError ? (
              <p className="text-sm text-destructive">No se pudieron cargar las columnas.</p>
            ) : grouped.map((group) => {
              const all = group.columns.every((c) => selected.has(c.key))
              return (
                <div key={group.key} className="rounded-md border border-[hsl(var(--border))] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group.label}</p>
                    <button type="button" className="text-xs text-[hsl(var(--primary))] hover:underline" onClick={() => setGroup(group.columns, !all)}>{all ? 'Quitar grupo' : 'Elegir grupo'}</button>
                  </div>
                  <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {group.columns.map((col) => (
                      <label key={col.key} className="flex cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11">
                        <Checkbox checked={selected.has(col.key)} onCheckedChange={() => toggle(col.key)} />
                        <span className="truncate">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
            {hasImages ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Las imágenes salen como enlaces (un arreglo por activo, la portada primero). Los enlaces vencen a los 7 días.</p>
            ) : null}
          </section>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={busy || !catalog || selected.size === 0 || count === 0} onClick={submit}>
            {busy ? 'Exportando...' : `Exportar ${count} ${count === 1 ? 'activo' : 'activos'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
