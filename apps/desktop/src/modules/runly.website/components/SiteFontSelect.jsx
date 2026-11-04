import { useEffect, useId, useState } from 'react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@runly/ui'
import { ensureStudioFont } from '../../runly.studio/lib/studio-fonts.js'
import { SITE_FONTS } from '../lib/siteFonts.js'

const familyOf = (stack) => String(stack ?? '').split(',')[0].replace(/['"]/g, '').trim()

// Options mount only when the menu opens, so each sample font loads on demand (same pattern as StudioFontPicker).
function FontOption({ font }) {
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let active = true
    ensureStudioFont(font.family).then(() => { if (active) setStatus('ready') }, () => { if (active) setStatus('error') })
    return () => { active = false }
  }, [font.family])
  return (
    <SelectItem value={font.stack} textValue={font.family} disabled={status === 'error'} className="min-h-16 py-2">
      <span className="block text-xs font-medium">{font.family} <span className="font-normal text-[hsl(var(--muted-foreground))]">· {font.category}</span></span>
      {status === 'ready'
        ? <span className="block text-xl" style={{ fontFamily: font.css, fontWeight: 400, fontSynthesis: 'none' }}>Ideas que toman forma</span>
        : <span className="block text-xs text-[hsl(var(--muted-foreground))]">{status === 'loading' ? 'Cargando muestra…' : 'No disponible.'}</span>}
    </SelectItem>
  )
}

export function SiteFontSelect({ label, value, onChange }) {
  const id = useId()
  const known = SITE_FONTS.find((font) => font.stack === value)
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue>
            <span style={{ fontFamily: known?.css ?? value }}>{known?.family ?? familyOf(value)}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className="max-h-[60dvh] w-80 max-w-[calc(100vw-2rem)]">
          <SelectGroup>
            <SelectLabel>Fuentes incluidas · licencia libre</SelectLabel>
            {!known && value && <SelectItem value={value}>{familyOf(value)}</SelectItem>}
            {SITE_FONTS.map((font) => <FontOption key={font.stack} font={font} />)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
