import { useEffect, useId, useState } from 'react'
import { ErrorState, Select, SelectContent, SelectItem, SelectLabel, SelectGroup, SelectTrigger, SelectValue, Skeleton, cn } from '@runly/ui'
import { STUDIO_FONTS } from '../../../../../shared/studio/fonts.js'
import { ensureStudioFont } from '../lib/studio-fonts.js'
// Options mount only when the menu opens. Never show a fallback as a font sample.
function FontOption({ font }) {
  const [status, setStatus] = useState(font.file ? 'loading' : 'ready')
  useEffect(() => {
    let active = true
    ensureStudioFont(font.family).then(() => { if (active) setStatus('ready') }, () => { if (active) setStatus('error') })
    return () => { active = false }
  }, [font.family])
  return <SelectItem value={font.family} textValue={font.name} disabled={status !== 'ready'} className="min-h-16 py-2">
    <span className="block text-xs font-medium">{font.name} <span className="font-normal text-[hsl(var(--muted-foreground))]">· {font.category}</span></span>
    {status === 'ready' ? <span className="block text-xl" style={{ fontFamily: font.family, fontWeight: 400, fontStyle: 'normal', fontSynthesis: 'none' }}>Ideas que toman forma</span>
      : status === 'loading' ? <span className="block text-xs text-[hsl(var(--muted-foreground))]">Cargando muestra…</span>
        : <span className="block text-xs text-destructive">No disponible. Abre de nuevo para reintentar.</span>}
  </SelectItem>
}

export function StudioFontPicker({ value, disabled, onChange, compact = false }) {
  const id = useId()
  const [loaded, setLoaded] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoaded(''); setError('')
    ensureStudioFont(value).then(() => { if (active) setLoaded(value) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [value, retry])
  return <div className={cn(compact ? 'w-36 shrink-0 sm:w-44' : 'space-y-2')}>
    {!compact ? <label htmlFor={id} className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Tipografía</label> : null}
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label="Tipografía" className={compact ? 'h-10 border-transparent shadow-none sm:h-9' : undefined}>
        <SelectValue>{STUDIO_FONTS.find(font => font.family === value)?.name ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="w-72 max-w-[calc(100vw-2rem)] motion-reduce:animate-none">
        <SelectGroup><SelectLabel>Fuentes locales · Regular 400</SelectLabel>{STUDIO_FONTS.map(font => <FontOption key={font.family} font={font} />)}</SelectGroup>
      </SelectContent>
    </Select>
    {error ? <ErrorState variant="compact" title="Fuente no disponible" description={error} onRetry={() => setRetry(value => value + 1)} /> : !compact ? (
      loaded === value ? <p aria-label="Vista previa de la fuente" className="rounded-lg bg-[hsl(var(--muted)/0.5)] p-3 text-xl" style={{ fontFamily: value, fontWeight: 400, fontStyle: 'normal', fontSynthesis: 'none' }}>Ideas que toman forma</p>
        : <Skeleton className="h-14" aria-label="Cargando fuente" />
    ) : null}
    {!compact ? <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Regular · 400 · {value === 'sans-serif' ? 'Fuente del sistema' : 'OFL 1.1 · Archivo local'}</p> : null}
  </div>
}
