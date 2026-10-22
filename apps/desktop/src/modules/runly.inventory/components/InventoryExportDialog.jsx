import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, FileSpreadsheet, FileText, Images } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SearchInput, Skeleton } from '@runly/ui'
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

const choiceClass = (active) => `flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors pointer-coarse:min-h-11 ${active ? 'border-(--brand-primary) bg-(--brand-soft)' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]'}`

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
  const [filter, setFilter] = useState('')

  const catalogQuery = useQuery({
    queryKey: ['inventory', 'export-columns', activeCompanyId],
    queryFn: () => runly.inventory.getExportColumns(token).then((res) => res?.data ?? res),
    enabled: Boolean(token) && open,
    staleTime: 60 * 1000,
  })
  const catalog = catalogQuery.data

  useEffect(() => {
    if (!open) return
    setFilter('')
    setScope(selectedCount ? 'selected' : 'filtered')
  }, [open, selectedCount])
  useEffect(() => { if (open && catalog) setSelected(loadSelection(catalog)) }, [open, catalog])

  const grouped = useMemo(() => {
    const term = filter.trim().toLowerCase()
    return (catalog?.groups ?? [])
      .map((group) => ({ ...group, columns: catalog.columns.filter((c) => c.group === group.key && (!term || c.label.toLowerCase().includes(term))) }))
      .filter((group) => group.columns.length)
  }, [catalog, filter])

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
      <DialogContent scrollable size="2xl" className="md:max-w-5xl lg:h-[min(46rem,90dvh)]">
        <DialogHeader icon={FileSpreadsheet}>
          <DialogTitle>Exportar inventario</DialogTitle>
          <DialogDescription>Elige el formato, qué activos y qué columnas incluir. Las relaciones (responsable, área, compras, baja, imágenes) también se pueden exportar.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto overscroll-contain px-0.5 lg:grid-cols-[19rem_1fr] lg:overflow-hidden">
          <div className="space-y-6 lg:overflow-y-auto lg:pr-2">
            <section className="space-y-3">
              <p className="text-sm font-semibold">1. Formato</p>
              {FORMATS.map(({ value, label, hint, icon: Icon }) => (
                <button key={value} type="button" onClick={() => setFormat(value)} aria-pressed={format === value} className={choiceClass(format === value)}>
                  <Icon className="mt-0.5 h-6 w-6 shrink-0" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-[hsl(var(--muted-foreground))]">{hint}</span></span>
                  {format === value ? <Check className="h-4 w-4 shrink-0 text-(--brand-primary)" /> : null}
                </button>
              ))}
            </section>

            <section className="space-y-3">
              <p className="text-sm font-semibold">2. Activos a exportar</p>
              <button type="button" onClick={() => setScope('filtered')} aria-pressed={scope === 'filtered'} className={choiceClass(scope === 'filtered')}>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Toda la lista actual</span><span className="block text-xs text-[hsl(var(--muted-foreground))]">{(context?.total ?? 0).toLocaleString('es-MX')} activos, con tu búsqueda y filtros</span></span>
                {scope === 'filtered' ? <Check className="h-4 w-4 shrink-0 text-(--brand-primary)" /> : null}
              </button>
              {selectedCount ? (
                <button type="button" onClick={() => setScope('selected')} aria-pressed={scope === 'selected'} className={choiceClass(scope === 'selected')}>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Solo los seleccionados</span><span className="block text-xs text-[hsl(var(--muted-foreground))]">{selectedCount.toLocaleString('es-MX')} activos</span></span>
                  {scope === 'selected' ? <Check className="h-4 w-4 shrink-0 text-(--brand-primary)" /> : null}
                </button>
              ) : null}
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Máximo {catalog?.maxRows?.toLocaleString('es-MX') ?? '20,000'} activos por archivo.</p>
            </section>

            {hasImages ? (
              <div className="flex gap-2 rounded-lg bg-[hsl(var(--muted))]/50 p-3 text-xs text-[hsl(var(--muted-foreground))]">
                <Images className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Las imágenes salen como enlaces: un arreglo por activo, con la portada primero. Los enlaces vencen a los 7 días.</p>
              </div>
            ) : null}
          </div>

          <section className="flex min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">3. Columnas <span className="font-normal text-[hsl(var(--muted-foreground))]">({selected.size} de {catalog?.columns.length ?? 0})</span></p>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => setSelected(new Set(catalog.columns.map((c) => c.key)))} disabled={!catalog}>Todas</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelected(new Set(catalog.columns.filter((c) => c.default).map((c) => c.key)))} disabled={!catalog}>Predeterminadas</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelected(new Set())} disabled={!catalog}>Ninguna</Button>
              </div>
            </div>
            <SearchInput value={filter} onChange={(e) => setFilter(e.target.value)} onClear={() => setFilter('')} placeholder="Buscar columna..." />
            <div className="min-h-0 flex-1 space-y-3 lg:overflow-y-auto lg:pr-2">
              {catalogQuery.isLoading ? <Skeleton className="h-64 w-full" /> : catalogQuery.isError ? (
                <p className="text-sm text-destructive">No se pudieron cargar las columnas.</p>
              ) : !grouped.length ? (
                <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Ninguna columna coincide con la búsqueda.</p>
              ) : grouped.map((group) => {
                const all = group.columns.every((c) => selected.has(c.key))
                return (
                  <div key={group.key} className="rounded-lg border border-[hsl(var(--border))] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group.label}</p>
                      <button type="button" className="text-xs font-medium text-[hsl(var(--primary))] hover:underline pointer-coarse:min-h-11" onClick={() => setGroup(group.columns, !all)}>{all ? 'Quitar grupo' : 'Elegir grupo'}</button>
                    </div>
                    <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
                      {group.columns.map((col) => (
                        <label key={col.key} className="flex cursor-pointer items-center gap-2.5 text-sm pointer-coarse:min-h-11">
                          <Checkbox checked={selected.has(col.key)} onCheckedChange={() => toggle(col.key)} />
                          <span className="min-w-0 leading-snug">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={busy || !catalog || selected.size === 0 || count === 0} onClick={submit}>
            {busy ? 'Exportando...' : `Exportar ${count.toLocaleString('es-MX')} ${count === 1 ? 'activo' : 'activos'} a ${format === 'xlsx' ? 'Excel' : 'CSV'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
