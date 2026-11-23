import { Button, NumberStepper, SelectField } from '@runly/ui'
import { ClipboardCopy, ClipboardPaste, CopyPlus, Trash2 } from 'lucide-react'
import { MOTION_LIMITS } from '../../../../../../../shared/studio/motion.js'
import { positionPath } from '../../../lib/motion-path.js'
import { keyframeValuesAt } from '../../../../../../../shared/studio/motion.js'
import { formatSeconds } from '../../../lib/timeline-math.js'

const FIELDS = [
  { key: 'x', label: 'Posición X', min: -16384, max: 16384, step: 1, precision: 0 },
  { key: 'y', label: 'Posición Y', min: -16384, max: 16384, step: 1, precision: 0 },
  { key: 'rotation', label: 'Rotación (°)', min: -3600, max: 3600, step: 1, precision: 0 },
  { key: 'opacity', label: 'Opacidad (%)', min: 0, max: 100, step: 5, precision: 0, scale: 100 },
  { key: 'scale', label: 'Escala (%)', min: 2, max: 800, step: 5, precision: 0, scale: 100 },
]
const EASINGS = [{ value: 'linear', label: 'Lineal' }, { value: 'ease', label: 'Suave' }, { value: 'ease-in', label: 'Acelerar' }, { value: 'ease-out', label: 'Desacelerar' }, { value: 'ease-in-out', label: 'Acelerar y desacelerar' }]

// Values of the selected keyframe. A property the keyframe does not set shows the value
// its track has at that instant; editing it adds the property to this keyframe.
// Only animated values live here; the element's base geometry stays in Propiedades.
export function KeyframeInspector({ object, label, at, disabled, canPaste, onChange, onMove, onDuplicate, onRemove, onCopy, onPaste }) {
  const frame = object.keyframes?.find(entry => entry.at === at)
  if (!frame) return null
  const current = keyframeValuesAt(object, at), path = positionPath(object), index = path.findIndex(point => point.at === at)
  return (
    <section aria-label={`Keyframe en ${formatSeconds(at)}`} className="space-y-2.5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-300">Propiedades del keyframe</p>
        <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{label}{index >= 0 ? ` · punto ${index + 1} de ${path.length} de la trayectoria` : ''}</p>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium">Tiempo (s)</p>
        <NumberStepper label="Instante del keyframe en segundos" value={at / 1000} min={0} max={MOTION_LIMITS.maxDelay / 1000} step={0.1} precision={2} size="sm" disabled={disabled} className="w-full"
          onChange={next => onMove(Math.round(next * 1000))} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(field => {
          const value = frame[field.key] ?? current[field.key], shown = Math.round(value * (field.scale ?? 1))
          return (
            <div key={field.key} className="space-y-1">
              <p className={frame[field.key] === undefined ? 'text-[11px] text-[hsl(var(--muted-foreground))]' : 'text-[11px] font-medium'}>{field.label}</p>
              <NumberStepper label={`${field.label} del keyframe`} value={shown} min={field.min} max={field.max} step={field.step} precision={field.precision} size="sm" disabled={disabled} className="w-full"
                onChange={next => onChange({ [field.key]: next / (field.scale ?? 1) })} />
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Las posiciones son la esquina superior izquierda del elemento en este instante.</p>
      <SelectField label="Curva hasta este keyframe" options={EASINGS} value={frame.easing ?? 'linear'} disabled={disabled}
        onValueChange={easing => easing && easing !== (frame.easing ?? 'linear') && onChange({ easing: easing === 'linear' ? null : easing })} />
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" className="gap-1" onClick={onCopy}><ClipboardCopy className="h-3.5 w-3.5" aria-hidden />Copiar</Button>
        <Button type="button" size="sm" variant="outline" className="gap-1" disabled={disabled || !canPaste} onClick={onPaste}><ClipboardPaste className="h-3.5 w-3.5" aria-hidden />Pegar en el cabezal</Button>
        {index >= 0 ? <Button type="button" size="sm" variant="outline" className="gap-1" disabled={disabled} onClick={onDuplicate} title="Copia este punto un poco más tarde: el elemento se detiene aquí"><CopyPlus className="h-3.5 w-3.5" aria-hidden />Duplicar punto</Button> : null}
        <Button type="button" size="sm" variant="ghost" className="gap-1 text-destructive" disabled={disabled} onClick={onRemove}><Trash2 className="h-3.5 w-3.5" aria-hidden />Eliminar</Button>
      </div>
    </section>
  )
}
