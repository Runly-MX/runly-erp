import { useEffect, useMemo, useRef } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, ToolButton } from '@runly/ui'
import { ChevronLeft, ChevronRight, Layers, Loader2, Maximize2, ShieldCheck, Type, Wand2 } from 'lucide-react'
import { STUDIO_FONTS } from '../../../../../../shared/studio/fonts.js'
import { StudioThumbnail } from '../StudioThumbnail.jsx'
import { FadeSwap } from '../editor/SidePanel.jsx'
import { sizeLabel } from '../../lib/formats.js'

const DOTS = { backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / 0.18) 1px, transparent 1px)', backgroundSize: '18px 18px' }

// Plain-language summary of the free licenses a template's resources use.
const LICENSE_NOTES = {
  'OFL-1.1': 'Fuentes con licencia libre SIL OFL',
  MIT: 'Iconos con licencia libre MIT',
  ISC: 'Iconos con licencia libre ISC',
  'ISC / MIT': 'Iconos con licencia libre ISC / MIT',
}

function details(document) {
  const objects = document?.objects ?? []
  const fonts = [...new Set(objects.filter(item => item.type === 'text').map(item => item.fontFamily ?? 'sans-serif'))]
    .map(family => STUDIO_FONTS.find(font => font.family === family) ?? { family, name: family })
  const counts = new Map()
  for (const color of [document?.page.background, ...objects.map(item => item.fill)].filter(Boolean)) counts.set(color.toLowerCase(), (counts.get(color.toLowerCase()) ?? 0) + 1)
  const palette = [document?.page.background?.toLowerCase(), ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color)]
    .filter((color, index, all) => color && all.indexOf(color) === index).slice(0, 6)
  return { fonts, palette, count: objects.length }
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</p>
      {children}
    </div>
  )
}

// Large template viewer: the preview takes the space, details sit beside it
// (stacked on phones). ←/→ browse the templates of the current page.
export function TemplatePreviewDialog({ templates, template, onChange, onUse, creating }) {
  // Initial focus on the primary action: focusing an arrow would open its tooltip
  // and make the first Escape close the tooltip instead of the dialog.
  const primaryRef = useRef(null)
  const index = templates.findIndex(item => item.key === template?.key)
  const info = useMemo(() => details(template?.document), [template])
  const go = step => { const next = templates[index + step]; if (next) onChange(next) }
  useEffect(() => {
    if (!template) return undefined
    const keydown = event => {
      if (event.target.closest?.('input,textarea')) return
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })
  const notes = (template?.licenses ?? []).map(id => LICENSE_NOTES[id] ?? `Recursos con licencia ${id}`)
  return (
    <Dialog open={Boolean(template)} onOpenChange={open => { if (!open) onChange(null) }}>
      <DialogContent size="2xl" className="gap-0 overflow-hidden p-0 md:max-w-5xl md:p-0"
        onOpenAutoFocus={event => { event.preventDefault(); primaryRef.current?.focus() }}>
        {template ? (
          <div className="grid max-h-[92dvh] min-h-0 md:h-[min(86dvh,760px)] md:grid-cols-[minmax(0,1fr)_340px]">
            <div className="relative flex min-h-0 items-center justify-center bg-[hsl(var(--muted)/0.55)] px-12 py-8 max-md:h-[44dvh] md:px-16" style={DOTS}>
              <FadeSwap contentKey={template.key} className="flex h-full w-full items-center justify-center">
                <StudioThumbnail document={template.document} frameRatio={1} className="max-h-full max-w-full rounded-md shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)]" />
              </FadeSwap>
              <ToolButton label="Plantilla anterior" shortcut="←" side="right" disabled={index <= 0} onClick={() => go(-1)}
                className="glass absolute left-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full shadow-md"><ChevronLeft /></ToolButton>
              <ToolButton label="Plantilla siguiente" shortcut="→" side="left" disabled={index < 0 || index >= templates.length - 1} onClick={() => go(1)}
                className="glass absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full shadow-md"><ChevronRight /></ToolButton>
              {templates.length > 1 ? <span className="glass absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums">{index + 1} / {templates.length}</span> : null}
            </div>
            <aside className="flex min-h-0 flex-col border-[hsl(var(--border))] bg-[hsl(var(--card))] max-md:border-t md:border-l">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 pr-12">
                <div className="space-y-2">
                  <span className="inline-flex rounded-full bg-fuchsia-500/12 px-2.5 py-0.5 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">{template.category}</span>
                  <DialogTitle className="text-2xl font-bold tracking-tight">{template.name}</DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed">{template.description}</DialogDescription>
                </div>
                <Detail icon={Maximize2} label="Formato">
                  <p className="text-sm font-medium tabular-nums">{sizeLabel(template)}</p>
                </Detail>
                <Detail icon={Type} label="Tipografías">
                  <div className="flex flex-wrap gap-2">
                    {info.fonts.map(font => <span key={font.family} className="rounded-md border border-[hsl(var(--border))] px-2.5 py-1 text-sm" style={{ fontFamily: font.family }}>{font.name}</span>)}
                  </div>
                </Detail>
                <Detail icon={Layers} label="Paleta">
                  <div className="flex gap-2">
                    {info.palette.map(color => <span key={color} title={color} className="h-8 w-8 rounded-full border border-black/10 shadow-sm dark:border-white/15" style={{ backgroundColor: color }} />)}
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{info.count} elementos editables: cambia textos, colores, formas e imágenes.</p>
                </Detail>
                <div className="flex gap-2.5 rounded-xl bg-[hsl(var(--muted)/0.6)] p-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  <p>Diseño original de {template.creator ?? 'Runly'}. {notes.length ? `${notes.join(' · ')}: ` : ''}puedes usarla en tus piezas, incluso con fines comerciales.</p>
                </div>
              </div>
              <div className="shrink-0 border-t border-[hsl(var(--border))] p-4 pb-[max(1rem,var(--sab))]">
                <Button ref={primaryRef} className="h-11 w-full bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white hover:from-fuchsia-500 hover:to-violet-500" disabled={Boolean(creating)} onClick={() => onUse(template)}>
                  {creating ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Wand2 />}{creating ? 'Creando…' : 'Usar esta plantilla'}
                </Button>
              </div>
            </aside>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
