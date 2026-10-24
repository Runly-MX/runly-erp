import { FilePlus2, Loader2 } from 'lucide-react'
import { ErrorState, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from '@runly/ui'
import { NoteIcon } from '../noteIcons.jsx'
import { noteAccentColor } from '../lib/noteColors.js'
import { useIsDark } from '../hooks/useIsDark.js'
import { useSubpages } from '../hooks/useSubpages.js'
import { MAX_DEPTH_HINT } from '../lib/subpages.js'

const CHIP = 'flex h-8 [@media(pointer:coarse)]:h-11 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs transition-colors'

// Horizontal strip under the editor header: the note's sub-pages plus a
// "Subpagina" action. `canCreate` is false for the trash and read-only views
// (the chips still show); `depthBlocked` disables the action at level 3.
export function SubpagesStrip({ note, canCreate, depthBlocked, creating, onOpenNote, onCreate }) {
  const isDark = useIsDark()
  const { children, isLoading, isError, refetch } = useSubpages(note?.id)
  if (!note || (!canCreate && !isLoading && !children.length)) return null

  const addButton = (
    <button
      type="button"
      onClick={onCreate}
      disabled={depthBlocked || creating}
      className={`${CHIP} text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {creating ? <Loader2 size={13} className="animate-spin" /> : <FilePlus2 size={13} />}
      Subpagina
    </button>
  )

  return (
    <div
      className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-background/95 px-3 py-1.5 [-webkit-overflow-scrolling:touch]"
      aria-label="Subpaginas"
    >
      {isError ? (
        <ErrorState
          title="No se pudieron cargar las subpaginas"
          onRetry={refetch}
          showReport={false}
          className="flex-row! gap-3! rounded-md! px-3! py-1.5!"
        />
      ) : isLoading ? (
        <>
          <Skeleton className="h-8 w-28 shrink-0 rounded-md" />
          <Skeleton className="h-8 w-24 shrink-0 rounded-md" />
        </>
      ) : (
        children.map((child) => (
          <button
            key={child.id}
            type="button"
            onClick={() => onOpenNote?.(child.id)}
            className={`${CHIP} max-w-48 text-foreground hover:bg-muted`}
          >
            {child.icon ? <NoteIcon name={child.icon} size={13} className="shrink-0 text-amber-500" color={noteAccentColor(child.background_color, isDark)} /> : null}
            <span className="truncate">{child.title || 'Sin titulo'}</span>
          </button>
        ))
      )}
      {canCreate && (depthBlocked ? (
        <Tooltip>
          <TooltipTrigger asChild><span className="shrink-0">{addButton}</span></TooltipTrigger>
          <TooltipContent>{MAX_DEPTH_HINT}</TooltipContent>
        </Tooltip>
      ) : addButton)}
    </div>
  )
}
