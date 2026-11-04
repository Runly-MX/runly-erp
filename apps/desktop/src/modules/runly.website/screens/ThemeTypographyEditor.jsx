import { useEffect } from 'react'
import { SelectField } from '@runly/ui'
import { ensureStudioFont } from '../../runly.studio/lib/studio-fonts.js'
import { SiteFontSelect } from '../components/SiteFontSelect.jsx'

const SIZE_OPTIONS    = ['14px', '15px', '16px', '17px', '18px'].map((s) => ({ value: s, label: s }))
const WEIGHT_OPTIONS  = ['400', '500', '600', '700', '800'].map((w) => ({ value: w, label: w }))

const DEFAULTS = {
  bodyFont:      'Inter, sans-serif',
  headingFont:   'Inter, sans-serif',
  baseFontSize:  '16px',
  headingWeight: '700',
}

export default function ThemeTypographyEditor({ typography = {}, onChange }) {
  const merged = { ...DEFAULTS, ...typography }
  // The preview paints with the self-hosted catalog files; unknown families just fall back.
  useEffect(() => { for (const stack of [merged.headingFont, merged.bodyFont]) ensureStudioFont(String(stack).split(',')[0].replace(/['"]/g, '').trim()).catch(() => {}) }, [merged.headingFont, merged.bodyFont])

  function handleChange(key, value) {
    onChange({ ...merged, [key]: value })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Define la tipografia del sitio publico.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SiteFontSelect label="Fuente del cuerpo" value={merged.bodyFont} onChange={(v) => handleChange('bodyFont', v)} />
        <SiteFontSelect label="Fuente de títulos" value={merged.headingFont} onChange={(v) => handleChange('headingFont', v)} />
        <SelectField
          label="Tamano base"
          value={merged.baseFontSize}
          onChange={(v) => handleChange('baseFontSize', v)}
          options={SIZE_OPTIONS}
        />
        <SelectField
          label="Peso de titulos"
          value={merged.headingWeight}
          onChange={(v) => handleChange('headingWeight', v)}
          options={WEIGHT_OPTIONS}
        />
      </div>

      <div className="rounded-xl border border-[hsl(var(--border))] p-5 space-y-2">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Vista previa</p>
        <h2
          style={{
            fontFamily: merged.headingFont,
            fontWeight: merged.headingWeight,
            fontSize: '1.5rem',
          }}
          className="text-[hsl(var(--foreground))]"
        >
          Titulo de ejemplo
        </h2>
        <p
          style={{
            fontFamily: merged.bodyFont,
            fontSize: merged.baseFontSize,
          }}
          className="text-[hsl(var(--muted-foreground))]"
        >
          Texto de ejemplo para visualizar la tipografia del cuerpo del sitio web.
        </p>
      </div>
    </div>
  )
}
