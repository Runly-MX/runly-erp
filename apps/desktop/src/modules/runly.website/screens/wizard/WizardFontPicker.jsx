import { useEffect, useMemo, useState } from 'react'
import { Input } from '@runly/ui'
import { Check, Search, Type } from 'lucide-react'
import { ensureStudioFont } from '../../../runly.studio/lib/studio-fonts.js'
import { FONT_GROUPS, FONT_PAIRINGS, SITE_FONTS, fontCss } from '../../lib/siteFonts.js'

// Loads a family once (self-hosted Studio files, never the internet) and reports when it can paint.
export function useFontsReady(families) {
  const [ready, setReady] = useState(() => new Set())
  useEffect(() => {
    let alive = true
    families.forEach((family) => {
      ensureStudioFont(family, 'regular').then(() => alive && setReady((prev) => (prev.has(family) ? prev : new Set(prev).add(family)))).catch(() => {})
    })
    return () => { alive = false }
  }, [families])
  return ready
}

const chip = (active) => `rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${active ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`

// Heading + body font picker: ready-made pairings on top, then the full catalog by role.
export function WizardFontPicker({ headingFont, bodyFont, onChange }) {
  const [role, setRole] = useState('heading')
  const [group, setGroup] = useState('all')
  const [query, setQuery] = useState('')
  const selected = role === 'heading' ? headingFont : bodyFont

  const visible = useMemo(() => {
    const test = FONT_GROUPS.find((item) => item.id === group)?.test ?? (() => true)
    const needle = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return SITE_FONTS.filter((font) => test(font) && (!needle || font.family.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(needle)))
  }, [group, query])
  const families = useMemo(() => [...new Set([headingFont, bodyFont, ...FONT_PAIRINGS.flatMap((p) => [p.heading, p.body]), ...visible.map((font) => font.family)])], [headingFont, bodyFont, visible])
  const ready = useFontsReady(families)
  const painted = (family) => (ready.has(family) ? { fontFamily: fontCss(family) } : undefined)

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">Combinaciones listas</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FONT_PAIRINGS.map((pair) => {
            const active = pair.heading === headingFont && pair.body === bodyFont
            return (
              <button key={pair.id} type="button" aria-pressed={active} onClick={() => onChange({ headingFont: pair.heading, bodyFont: pair.body })}
                className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${active ? 'border-orange-500 bg-orange-500/5' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--ring))]/50'}`}>
                <span className="block truncate text-lg font-semibold leading-tight" style={painted(pair.heading)}>{pair.label}</span>
                <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]" style={painted(pair.body)}>{pair.heading} + {pair.body}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Qué fuente cambiar" className="inline-flex rounded-lg bg-[hsl(var(--muted))] p-0.5">
            {[['heading', 'Títulos', headingFont], ['body', 'Texto', bodyFont]].map(([id, label, family]) => (
              <button key={id} type="button" role="tab" aria-selected={role === id} onClick={() => setRole(id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${role === id ? 'bg-[hsl(var(--card))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}>
                {label} · <span style={painted(family)}>{family}</span>
              </button>
            ))}
          </div>
          <label className="relative ml-auto min-w-40 flex-1 sm:max-w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar fuente…" aria-label="Buscar fuente"
              className="h-8 pl-8" />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estilo de fuente">
          {FONT_GROUPS.map((item) => <button key={item.id} type="button" aria-pressed={group === item.id} onClick={() => setGroup(item.id)} className={chip(group === item.id)}>{item.label}</button>)}
        </div>
        <ul className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3" role="listbox" aria-label="Fuentes disponibles">
          {visible.map((font) => {
            const active = font.family === selected
            return (
              <li key={font.family} role="option" aria-selected={active}>
                <button type="button" onClick={() => onChange(role === 'heading' ? { headingFont: font.family } : { bodyFont: font.family })}
                  className={`relative flex h-full w-full flex-col rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${active ? 'border-orange-500 bg-orange-500/5' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--ring))]/50'}`}>
                  <span className="text-xl leading-none" style={painted(font.family)}>Aa</span>
                  <span className="mt-1.5 truncate text-xs font-medium">{font.family}</span>
                  <span className="truncate text-[10px] text-[hsl(var(--muted-foreground))]">{font.category}</span>
                  {active && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-orange-600" aria-hidden />}
                </button>
              </li>
            )
          })}
          {visible.length === 0 && <li className="col-span-full flex items-center gap-2 p-3 text-sm text-[hsl(var(--muted-foreground))]"><Type className="h-4 w-4" aria-hidden /> No hay fuentes con ese nombre.</li>}
        </ul>
      </div>
    </div>
  )
}
