import { useEffect, useState } from 'react'
import { Button, CheckboxField, SelectField, TextField } from '@runly/ui'
import { Database, Loader2 } from 'lucide-react'

const ALL = '__all'
// Per-viewer convenience: the last module + filters used with this design (never the data).
export function rememberedSource(key) { try { return key ? JSON.parse(window.localStorage.getItem(key) ?? 'null') : null } catch { return null } }

// Live records of a Runly module (Inventario, Flota...) as bulk-create rows.
// Read with the user's own module permissions; nothing is saved in the design.
export function ModuleSourcePicker({ loadSources, loadRows, onLoaded, rememberKey }) {
  const [remembered] = useState(() => rememberedSource(rememberKey))
  const [sources, setSources] = useState(null), [key, setKey] = useState(''), [filters, setFilters] = useState(remembered?.filters ?? {})
  const [busy, setBusy] = useState(false), [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    loadSources().then(list => { if (alive) { setSources(list); setKey(list.some(item => item.key === remembered?.key) ? remembered.key : list[0]?.key ?? '') } })
      .catch(failure => { if (alive) { setSources([]); setError(failure?.message || 'No se pudieron cargar los módulos.') } })
    return () => { alive = false }
  }, [loadSources, remembered])
  const source = sources?.find(item => item.key === key)
  async function load() {
    setBusy(true); setError(null)
    try {
      onLoaded(source, await loadRows(key, filters))
      try { if (rememberKey) window.localStorage.setItem(rememberKey, JSON.stringify({ key, filters })) } catch { /* storage unavailable */ }
    }
    catch (failure) { setError(failure?.message || 'No se pudieron cargar los registros.') } finally { setBusy(false) }
  }
  if (!sources) return <p className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />Cargando módulos…</p>
  if (!sources.length) return <p className="text-xs text-[hsl(var(--muted-foreground))]">{error ?? 'No tienes acceso a módulos con datos para Studio.'}</p>
  const set = (name, value) => setFilters(current => ({ ...current, [name]: value }))
  return (
    <div className="space-y-3">
      <SelectField label="Módulo" value={key} onValueChange={next => { setKey(next); setFilters({}) }} options={sources.map(item => ({ value: item.key, label: item.label }))} />
      {source?.filters.map(filter => filter.type === 'text'
        ? <TextField key={filter.key} id={`studio-source-${filter.key}`} label={filter.label} value={filters[filter.key] ?? ''} autoComplete="off" onChange={event => set(filter.key, event.target.value)} />
        : filter.type === 'select'
          ? <SelectField key={filter.key} label={filter.label} value={filters[filter.key] || ALL} onValueChange={value => set(filter.key, value === ALL ? '' : value)}
            options={[{ value: ALL, label: 'Todas' }, ...filter.options]} />
          : <CheckboxField key={filter.key} label={filter.label} checked={filters[filter.key] === true} onChange={event => set(filter.key, event.target.checked)} />)}
      {error ? <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{error}</p> : null}
      <Button type="button" variant="outline" disabled={busy || !source} onClick={load} className="w-full gap-1.5">
        {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Database className="h-4 w-4" aria-hidden />}Usar estos registros
      </Button>
    </div>
  )
}
