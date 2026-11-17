import { useEffect, useState } from 'react'
import { SegmentedControl, SelectField } from '@runly/ui'
import { Info } from 'lucide-react'
import { MOTION_EXPORT_LIMITS } from '../../lib/motion-export-plan.js'

const seconds = ms => `${Number((ms / 1000).toFixed(1)).toString().replace('.', ',')} s`
const megabytes = bytes => (bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} kB` : `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB`)

// GIF / MP4 / WebM options and a summary of what will be generated.
export function MotionExportOptions({ type, value, onChange, plan, pageScope }) {
  const gif = type === 'gif', limits = MOTION_EXPORT_LIMITS[gif ? 'gif' : 'video']
  const [encoding, setEncoding] = useState(null)
  // Which encoder this browser offers for the chosen size (WebCodecs or the slower fallback).
  useEffect(() => {
    let live = true
    setEncoding(null)
    if (gif || plan.error) return undefined
    import('../../lib/studio-motion-export.js').then(({ pickEncoder }) => pickEncoder(plan)).then(config => { if (live) setEncoding(config ? 'fast' : 'fallback') }).catch(() => { if (live) setEncoding('fallback') })
    return () => { live = false }
  }, [gif, plan.width, plan.height, plan.fps, plan.bitrate, plan.type, plan.error]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      {pageScope}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Resolución" value={String(value.side)} onValueChange={side => side && onChange({ side: Number(side) })}
          options={limits.sides.map(side => ({ value: String(side), label: `Hasta ${side} px` }))} />
        <SelectField label="Fotogramas por segundo" value={String(value.fps)} onValueChange={fps => fps && onChange({ fps: Number(fps) })}
          options={limits.fps.map(fps => ({ value: String(fps), label: `${fps} fps` }))} />
      </div>
      {gif ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Repetición</p>
          <SegmentedControl ariaLabel="Repetición del GIF" value={value.loop === false ? 'once' : 'loop'} onChange={loop => onChange({ loop: loop === 'loop' })} className="w-full [&_button]:min-w-0"
            options={[{ value: 'loop', label: 'Repetir siempre' }, { value: 'once', label: 'Una vez' }]} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Calidad</p>
          <SegmentedControl ariaLabel="Calidad del video" value={value.quality ?? 'standard'} onChange={quality => onChange({ quality })} className="w-full [&_button]:min-w-0"
            options={[{ value: 'standard', label: 'Normal' }, { value: 'high', label: 'Alta' }]} />
        </div>
      )}
      {plan.error ? null : (
        <section aria-label="Resumen de la exportación" className="space-y-1 rounded-md border border-[hsl(var(--border))] p-3 text-sm">
          <p className="font-semibold">{seconds(plan.duration)} · {plan.frames} fotogramas · {plan.width} × {plan.height} px</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {plan.segments.length} {plan.segments.length === 1 ? 'página' : 'páginas'} con sus duraciones, animaciones y transiciones, como en Presentar. Tamaño aproximado: {megabytes(plan.estimatedBytes)}.
          </p>
          {gif ? <p className="text-xs text-[hsl(var(--muted-foreground))]">GIF: hasta {seconds(limits.maxDuration)}, 256 colores y sin sonido; los degradados y fotos pueden verse con bandas.</p> : null}
          {!gif && encoding ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{encoding === 'fast' ? 'Codificación acelerada del navegador.' : 'Este navegador no codifica este formato de forma acelerada: se usa una codificación compatible más lenta.'}</p> : null}
        </section>
      )}
      <p className="flex gap-2 rounded-md bg-[hsl(var(--muted)/0.5)] p-2.5 text-xs text-[hsl(var(--muted-foreground))]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Se genera en este dispositivo: deja la pestaña abierta hasta que termine. Puedes cancelar en cualquier momento; el diseño no cambia.</span>
      </p>
    </div>
  )
}
