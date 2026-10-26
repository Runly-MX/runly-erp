import { Button, SegmentedControl } from '@runly/ui'
import { Shapes } from 'lucide-react'
import { DEFAULT_GRADIENT } from '../../../../../../../shared/studio/gradient.js'
import { StudioColorPicker } from '../StudioColorPicker.jsx'
import { GradientEditor } from './GradientEditor.jsx'

// Live page background (Página panel): solid color (setPageBackground removes
// the gradient) or gradient (page.backgroundPaint). Each change is one undo
// step; drags are one step through begin/end. `canApplyToSelection`: the
// selected shape can take the same gradient.
export function PageBackground({ page, disabled, paint, canApplyToSelection, onError }) {
  const gradient = page.backgroundPaint ?? null
  return (
    <section aria-label="Fondo" className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Fondo</p>
      <SegmentedControl ariaLabel="Tipo de fondo" value={gradient ? 'gradient' : 'solid'} disabled={disabled} className="w-full [&_button]:min-w-0"
        options={[{ value: 'solid', label: 'Color' }, { value: 'gradient', label: 'Degradado' }]}
        onChange={value => (value === 'gradient' ? paint.pageGradient(gradient ?? DEFAULT_GRADIENT) : paint.setPageColor(page.background))} />
      {gradient ? (
        <GradientEditor paint={gradient} disabled={disabled} api={paint.page} onError={onError}>
          {canApplyToSelection ? (
            <Button variant="ghost" size="sm" className="w-full gap-1.5" disabled={disabled} onClick={() => paint.toSelection(gradient)}><Shapes className="h-3.5 w-3.5" />Aplicar a la forma seleccionada</Button>
          ) : null}
        </GradientEditor>
      ) : <StudioColorPicker value={page.background} disabled={disabled} onChange={paint.setPageColor} />}
    </section>
  )
}
