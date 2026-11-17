import { useMemo } from 'react'
import { CheckboxField } from '@runly/ui'
import { Info } from 'lucide-react'
import { findPage } from '../../../../../../shared/studio/pages.js'
import { sceneHasMotion } from '../../../../../../shared/studio/motion.js'
import { MAPPED_TRANSITIONS, classify } from '../../lib/pptx-mapping.js'

// What the PowerPoint file will contain, computed from the design before exporting.
export function compatibility(document, pageIds) {
  const scenes = pageIds.map(id => findPage(document, id)).filter(Boolean)
  const editable = { text: 0, shape: 0, line: 0, image: 0 }, images = new Map()
  let fades = 0, unsupported = 0
  let animated = 0, groups = 0, mixed = false
  scenes.forEach((scene, index) => {
    const transition = index ? scene.page.slide?.transition?.type : null
    if (MAPPED_TRANSITIONS.includes(transition)) fades++
    else if (transition && transition !== 'none') unsupported++
    if (sceneHasMotion(scene)) animated++
    if (scene.objects.some(item => item.groupId)) groups++
    if (scenes[0].page.width * scene.page.height !== scenes[0].page.height * scene.page.width) mixed = true
    for (const item of scene.objects) {
      const { kind, reason } = classify(item)
      if (kind === 'raster') images.set(reason, (images.get(reason) ?? 0) + 1)
      else if (kind === 'photo-shape') editable.image++
      else if (kind !== 'skip') editable[kind]++
    }
  })
  return { slides: scenes.length, editable, images: [...images], fades, unsupported, animated, groups, mixed }
}

export function PptxExportOptions({ document, pageIds, value, onChange, pageScope }) {
  const report = useMemo(() => compatibility(document, pageIds), [document, pageIds])
  const editableCount = Object.values(report.editable).reduce((a, b) => a + b, 0)
  return (
    <div className="space-y-4">
      {pageScope}
      <CheckboxField label="Añadir una diapositiva con la reproducción animada (MP4)" checked={Boolean(value.video)} onChange={event => onChange({ video: event.target.checked })}
        hint="Las diapositivas editables no cambian; al final se añade un video con las animaciones y transiciones, como en Presentar. El archivo pesa más." />
      <section aria-label="Compatibilidad con PowerPoint" className="space-y-1.5 rounded-md border border-[hsl(var(--border))] p-3 text-sm">
        <p className="font-semibold">{report.slides} {report.slides === 1 ? 'diapositiva' : 'diapositivas'} · {editableCount} elementos editables</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{report.editable.text} textos, {report.editable.shape} formas, {report.editable.line} líneas y {report.editable.image} fotos, cada uno como elemento independiente.</p>
        {report.images.length ? <p className="text-xs text-amber-700 dark:text-amber-300">Como imagen de cada elemento (no editable): {report.images.map(([reason, count]) => `${count} por ${reason}`).join('; ')}.</p> : null}
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{report.fades ? `${report.fades} ${report.fades === 1 ? 'transición' : 'transiciones'} de fundido (velocidad aproximada).` : 'Sin transiciones de fundido.'} Cada diapositiva guarda su duración para avanzar sola.</p>
        {report.unsupported ? <p className="text-xs text-amber-700 dark:text-amber-300">{report.unsupported === 1 ? 'Una transición de deslizar o acercar no se exporta' : `${report.unsupported} transiciones de deslizar o acercar no se exportan`}: los programas las interpretan de forma distinta y esas diapositivas cambian sin efecto.</p> : null}
        {report.animated ? <p className="text-xs text-amber-700 dark:text-amber-300">{report.animated === 1 ? 'Una página tiene' : `${report.animated} páginas tienen`} animaciones de elementos: PowerPoint las recibe en su posición final, sin animar.{value.video ? ' La diapositiva de video las muestra.' : ''}</p> : null}
        {report.groups ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Los grupos se exportan como elementos sueltos.</p> : null}
        {report.mixed ? <p className="text-xs text-[hsl(var(--muted-foreground))]">PowerPoint usa un solo tamaño: las páginas con otra proporción se centran con franjas negras.</p> : null}
      </section>
      <p className="flex gap-2 rounded-md bg-[hsl(var(--muted)/0.5)] p-2.5 text-xs text-[hsl(var(--muted-foreground))]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Las fuentes no se incrustan: PowerPoint usa la misma fuente si está instalada o una similar. Las fotos se incluyen dentro del archivo.</span>
      </p>
    </div>
  )
}
