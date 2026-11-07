import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, CheckboxField, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, FilterToolbar, SearchInput, cn } from '@runly/ui'
import { Database, Loader2 } from 'lucide-react'
import { describeRecord } from '../../lib/studio-records.js'
import { useInventoryPickerFilters } from '../../../runly.inventory/hooks/useInventoryMapFilters.js'

const PLACEHOLDER = { inventory: 'Buscar por activo, serie, nombre, marca, modelo…', fleet: 'Buscar por placa, marca, modelo…', hr: 'Buscar por nombre o número de empleado…', contacts: 'Buscar por nombre, correo o teléfono…' }

// Search + the module's own filter menu (Inventario: the same one as its list). `filters` holds search and the menu values together.
function Toolbar({ source, filters, setFilters, specs }) {
  const { search = '', ...menu } = filters
  const box = <SearchInput value={search} onChange={event => setFilters({ ...filters, search: event.target.value })} onClear={() => setFilters({ ...filters, search: '' })}
    placeholder={PLACEHOLDER[source.key] ?? 'Buscar…'} aria-label="Buscar registros" maxLength={80} />
  return <FilterToolbar search={box} filterSpecs={specs} filterValue={menu} onFilterChange={next => setFilters({ search, ...next })} className="shrink-0" />
}
function InventoryToolbar(props) { return <Toolbar {...props} specs={useInventoryPickerFilters()} /> }

// "Elegir registros": live search over the module's records the user may read,
// then check the ones that become versions. Public links are only issued for the chosen ones.
export function RecordPickerDialog({ open, onOpenChange, source, loadRows, initialFilters = {}, onConfirm }) {
  const [filters, setFilters] = useState(initialFilters), [result, setResult] = useState(null), [picked, setPicked] = useState(() => new Set())
  const [loading, setLoading] = useState(false), [error, setError] = useState(null), [confirming, setConfirming] = useState(false), latest = useRef(0)
  const filterKey = JSON.stringify(filters)
  useEffect(() => {
    if (!open) return undefined
    const request = ++latest.current
    const timer = setTimeout(async () => {
      setLoading(true); setError(null)
      try {
        const data = await loadRows(source.key, { ...filters, preview: true })
        if (request === latest.current) setResult(data)
      } catch (failure) { if (request === latest.current) { setResult(null); setError(failure?.message || 'No se pudieron cargar los registros.') } }
      finally { if (request === latest.current) setLoading(false) }
    }, 300)
    return () => clearTimeout(timer)
    // filters are compared by value through filterKey
  }, [open, source.key, filterKey, loadRows]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = result?.rows ?? [], ids = result?.ids ?? [], idAt = index => ids[index] ?? null
  const selectable = rows.map((_, index) => idAt(index)).filter(Boolean), allPicked = selectable.length > 0 && selectable.every(id => picked.has(id))
  const toggle = id => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  async function confirm() {
    setConfirming(true); setError(null)
    try { await onConfirm({ ...filters, preview: false, ids: [...picked] }); onOpenChange(false) }
    catch (failure) { setError(failure?.message || 'No se pudieron cargar los registros.') } finally { setConfirming(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="flex max-h-[90dvh] flex-col">
        <DialogHeader icon={Database}>
          <DialogTitle>Elegir registros de {source.label}</DialogTitle>
          <DialogDescription>Solo ves lo que tu rol permite leer. Marca los que quieres convertir en versiones.</DialogDescription>
        </DialogHeader>
        {source.key === 'inventory' ? <InventoryToolbar source={source} filters={filters} setFilters={setFilters} /> : <Toolbar source={source} filters={filters} setFilters={setFilters} specs={null} />}
        <div className="flex items-center justify-between gap-3 text-xs text-[hsl(var(--muted-foreground))]">
          <CheckboxField label={`Seleccionar los ${selectable.length} mostrados`} checked={allPicked} disabled={!selectable.length}
            onChange={event => setPicked(current => { const next = new Set(current); selectable.forEach(id => (event.target.checked ? next.add(id) : next.delete(id))); return next })} />
          <span className="flex items-center gap-1.5 tabular-nums">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {result ? `${rows.length}${result.truncated ? ` de ${result.total}` : ''} registros · ${picked.size} elegidos` : ''}</span>
        </div>
        <ul aria-label="Registros" aria-busy={loading} className="min-h-40 flex-1 divide-y divide-[hsl(var(--border))] overflow-y-auto rounded-lg border border-[hsl(var(--border))]">
          {rows.map((row, index) => {
            const id = idAt(index), info = describeRecord(source.key, row, result.headers)
            return (
              <li key={id ?? index}>
                <label className={cn('flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-[hsl(var(--muted)/0.5)]', id && picked.has(id) && 'bg-[hsl(var(--muted)/0.5)]')}>
                  <Checkbox className="mt-1" checked={Boolean(id && picked.has(id))} disabled={!id} onCheckedChange={() => toggle(id)} aria-label={`Elegir ${info.title}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{info.title}</span>
                    <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{info.detail || '—'}</span>
                  </span>
                  {info.extra ? <span className="hidden max-w-40 shrink-0 truncate text-xs text-[hsl(var(--muted-foreground))] sm:block">{info.extra}</span> : null}
                </label>
              </li>
            )
          })}
          {result && !rows.length ? <li className="px-3 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">Ningún registro coincide con la búsqueda.</li> : null}
          {!result && !error ? <li className="px-3 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">Cargando registros…</li> : null}
        </ul>
        {error ? <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={!picked.size || confirming} onClick={confirm} className="gap-1.5">
            {confirming ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}Usar {picked.size || ''} {picked.size === 1 ? 'registro' : 'registros'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
