import { Button } from '@runly/ui'
import { ImagePlus } from 'lucide-react'
import { FrameThumb } from './FramesGrid.jsx'

// Shown while Studio waits for the user to pick a photo (for a frame, or to
// replace the selected one). Cancelling rolls back the pending step.
export function PendingPhotoBanner({ pending, onCancel }) {
  const frame = pending.kind === 'frame' ? pending.preset : null
  return (
    <div role="status" className="glass pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl py-1.5 pl-2 pr-1.5 shadow-lg">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/12 text-fuchsia-600">
        {frame ? <span className="h-7 w-7"><FrameThumb preset={frame} /></span> : <ImagePlus className="h-4 w-4" />}
      </span>
      <p className="min-w-0 text-sm">
        <span className="font-semibold">{frame ? `Marco «${frame.label}»` : 'Reemplazar foto'}</span>
        <span className="text-[hsl(var(--muted-foreground))]"> · Elige o sube una foto en Imágenes</span>
      </p>
      <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
    </div>
  )
}
