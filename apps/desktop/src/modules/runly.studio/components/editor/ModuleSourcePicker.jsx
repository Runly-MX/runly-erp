import { useEffect, useState } from 'react'
import { Button, SelectField } from '@runly/ui'
import { ListChecks, Loader2 } from 'lucide-react'
import { RecordPickerDialog } from './RecordPickerDialog.jsx'

// Per-viewer convenience: the last module + filters used with this design (never the data).
export function rememberedSource(key) { try { return key ? JSON.parse(window.localStorage.getItem(key) ?? 'null') : null } catch { return null } }

// Live records of a Runly module (Inventario, Flota...) as bulk-create rows.
// Read with the user's own module permissions; nothing is saved in the design.
export function ModuleSourcePicker({ loadSources, loadRows, onLoaded, rememberKey }) {
  const [remembered] = useState(() => rememberedSource(rememberKey))
  const [sources, setSources] = useState(null), [key, setKey] = useState(''), [open, setOpen] = useState(false), [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    loadSources().then(list => { if (alive) { setSources(list); setKey(list.some(item => item.key === remembered?.key) ? remembered.key : list[0]?.key ?? '') } })
      .catch(failure => { if (alive) { setSources([]); setError(failure?.message || 'No se pudieron cargar los módulos.') } })
    return () => { alive = false }
  }, [loadSources, remembered])
  const source = sources?.find(item => item.key === key)
  if (!sources) return <p className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />Cargando módulos…</p>
  if (!sources.length) return <p className="text-xs text-[hsl(var(--muted-foreground))]">{error ?? 'No tienes acceso a módulos con datos para Studio.'}</p>
  async function use(filters) {
    onLoaded(source, await loadRows(key, filters))
    try { if (rememberKey) window.localStorage.setItem(rememberKey, JSON.stringify({ key, filters: { ...filters, ids: undefined, preview: undefined } })) } catch { /* storage unavailable */ }
  }
  return (
    <div className="space-y-3">
      <SelectField label="Módulo" value={key} onValueChange={setKey} options={sources.map(item => ({ value: item.key, label: item.label }))} />
      <Button type="button" variant="outline" disabled={!source} onClick={() => setOpen(true)} className="w-full gap-1.5"><ListChecks className="h-4 w-4" aria-hidden />Buscar y elegir registros</Button>
      {source ? <RecordPickerDialog key={key} open={open} onOpenChange={setOpen} source={source} loadRows={loadRows} initialFilters={remembered?.key === key ? remembered.filters : {}} onConfirm={use} /> : null}
    </div>
  )
}
