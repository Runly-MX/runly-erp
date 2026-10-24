import { useState } from 'react'
import { Files, FilePlus2, ChevronRight, Loader2 } from 'lucide-react'
import {
  Button, EmptyState, ErrorState, Skeleton,
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@runly/ui'
import { NoteIcon } from '../noteIcons.jsx'
import { noteAccentColor } from '../lib/noteColors.js'
import { useIsDark } from '../hooks/useIsDark.js'
import { useSubpages } from '../hooks/useSubpages.js'
import { MAX_DEPTH_HINT } from '../lib/subpages.js'

// Keep navigation available without taking a permanent row from the paper.
export function SubpagesStrip({ note, canCreate, depthBlocked, creating, onOpenNote, onCreate }) {
  const [open, setOpen] = useState(false)
  const isDark = useIsDark()
  const { children, isLoading, isError, refetch } = useSubpages(note?.id)
  if (!note || (!canCreate && !isLoading && !isError && !children.length)) return null

  return (
    <>
      <Button type="button" size="sm" variant="ghost" className="touch-target" onClick={() => setOpen(true)} aria-label="Abrir subpáginas">
        <Files size={14} />
        <span className="hidden md:inline">Subpáginas</span>
        {!isLoading && children.length > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{children.length}</span>}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex flex-col gap-4 sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Subpáginas</SheetTitle>
            <SheetDescription className="truncate">{note.title || 'Sin título'}</SheetDescription>
          </SheetHeader>
          {canCreate && (
            <div className="space-y-2">
              <Button type="button" variant="secondary" className="w-full touch-target justify-start" disabled={depthBlocked || creating} onClick={onCreate}>
                {creating ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}
                Nueva subpágina
              </Button>
              {depthBlocked && <p className="text-xs text-muted-foreground">{MAX_DEPTH_HINT}</p>}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isError ? (
              <ErrorState title="No se pudieron cargar las subpáginas" onRetry={refetch} showReport={false} />
            ) : isLoading ? (
              <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : children.length === 0 ? (
              <EmptyState icon={Files} title="Todo en esta nota" description="Organiza los temas en subpáginas cuando necesites más espacio." />
            ) : (
              <nav aria-label="Subpáginas de la nota" className="space-y-1">
                {children.map(child => (
                  <Button key={child.id} type="button" variant="ghost" className="h-auto min-h-12 w-full justify-start gap-3 px-3 py-3 text-left" onClick={() => { setOpen(false); onOpenNote?.(child.id) }}>
                    <NoteIcon name={child.icon || 'FileText'} size={18} className="shrink-0 text-muted-foreground" color={noteAccentColor(child.background_color, isDark)} />
                    <span className="min-w-0 flex-1 truncate">{child.title || 'Sin título'}</span>
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                  </Button>
                ))}
              </nav>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
