import { useEffect, useRef } from 'react'
import { Button, ToolButton, cn } from '@runly/ui'
import { ChevronLeft, ChevronRight, LayoutGrid, X } from 'lucide-react'
import { PagesPanel } from './PagesPanel.jsx'

// Compact "Página 2 de 5" control over the canvas: previous/next page and the
// way into the page browser (full navigator on desktop, bottom sheet on phone).
export function PageSwitcher({ index, total, label, compact, navigatorOpen, onPrev, onNext, onBrowse, disabled }) {
  // A single page has nothing to step through: on phones only the count and the browser button remain.
  const single = compact && total <= 1
  return (
    <div role="group" aria-label="Navegación entre páginas" className="pointer-events-auto flex items-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0.5 shadow-md">
      {single ? null : <ToolButton label="Página anterior" side="top" disabled={disabled || index <= 0} onClick={onPrev} className="h-8 w-8"><ChevronLeft /></ToolButton>}
      <span className={cn('px-2 text-center text-xs font-medium tabular-nums', compact ? (single ? 'min-w-[2.75rem]' : 'min-w-[3.5rem]') : 'min-w-[7rem]')} aria-live="polite" aria-atomic="true">
        {compact ? `${index + 1} / ${total}` : <>Página {index + 1} de {total}<span className="sr-only">: {label}</span></>}
      </span>
      {single ? null : <ToolButton label="Página siguiente" side="top" disabled={disabled || index >= total - 1} onClick={onNext} className="h-8 w-8"><ChevronRight /></ToolButton>}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-[hsl(var(--border))]" />
      <ToolButton data-page-browse label={navigatorOpen ? 'Volver al lienzo' : 'Ver todas las páginas'} side="top" active={navigatorOpen} onClick={onBrowse} className="h-8 w-8"><LayoutGrid /></ToolButton>
    </div>
  )
}

// Full-area page browser that replaces the canvas view (the editor stays mounted
// underneath). Escape or "Volver al lienzo" returns.
export function PageNavigator({ onClose, ...panel }) {
  const close = useRef(null)
  useEffect(() => { close.current?.focus() }, [])
  return (
    <div role="region" aria-label="Navegador de páginas" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}
      className="absolute inset-0 z-30 flex flex-col bg-[hsl(var(--background))]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[hsl(var(--border))] px-4">
        <h2 className="text-sm font-semibold">Navegador de páginas</h2>
        <Button ref={close} variant="ghost" size="sm" onClick={onClose} className="h-8 gap-1.5"><X className="h-4 w-4" aria-hidden />Volver al lienzo</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <PagesPanel {...panel} layout="grid" />
      </div>
    </div>
  )
}
