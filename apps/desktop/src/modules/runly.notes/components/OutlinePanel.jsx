import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCurrentEditor } from '@tiptap/react'
import { ListTree, X } from 'lucide-react'
import {
  EmptyState, Sheet, SheetContent, SheetHeader, SheetTitle, useCoarsePointer,
} from '@runly/ui'
import { useOutline } from '../hooks/useOutline.js'
import { scrollToHeading } from '../lib/scrollToHeading.js'

function useIsWide() {
  const query = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

function OutlineList({ items, activeId, coarse, onPick }) {
  if (items.length === 0) {
    return <EmptyState icon={ListTree} title="Sin titulos" description="Usa Titulo 1 a 3 para generar el contenido" className="py-8" />
  }
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onPick(item.id)}
            style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
            className={[
              'w-full rounded-md pr-2 text-left text-sm transition-colors',
              coarse ? 'min-h-11 py-2' : 'py-1.5',
              item.id === activeId
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            ].join(' ')}
          >
            {item.text}
          </button>
        </li>
      ))}
    </ul>
  )
}

// Rail (right column, lg+) when a host element is provided; bottom sheet
// otherwise (small screens and pages where the document owns the scroll).
export function OutlinePanel({ open, onClose, railHost = null }) {
  const { editor } = useCurrentEditor()
  const wide = useIsWide()
  const coarse = useCoarsePointer()
  const { items, activeId } = useOutline(open ? editor : null)
  if (!editor || !open) return null

  const pick = (id) => {
    scrollToHeading(editor, id)
    if (!(wide && railHost)) onClose()
  }

  if (wide && railHost) {
    return createPortal(
      <aside className="flex h-full w-64 shrink-0 flex-col border-l border-border bg-background">
        <div className="flex h-10 shrink-0 items-center justify-between px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contenido</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar contenido"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <OutlineList items={items} activeId={activeId} coarse={coarse} onPick={pick} />
        </div>
      </aside>,
      railHost,
    )
  }

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose() }}>
      <SheetContent side="bottom" className="max-h-[60vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Contenido</SheetTitle>
        </SheetHeader>
        <OutlineList items={items} activeId={activeId} coarse={coarse} onPick={pick} />
      </SheetContent>
    </Sheet>
  )
}
