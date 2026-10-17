import { Button, cn } from '@runly/ui'
import { GripVertical } from 'lucide-react'

// Grip button that starts a drag (pointer) or a keyboard sort (space/Enter).
// `handleProps` come from dnd-kit; null hides the grip (sorting disabled) unless
// `overlay` (the floating copy while dragging) asks for the visual only.
export function DragHandle({ handleProps, label, overlay = false, className }) {
  if (!handleProps && !overlay) return null
  return (
    <Button
      type="button" variant="ghost" size="icon-sm" aria-label={label} title="Arrastra para ordenar"
      className={cn('shrink-0 cursor-grab touch-none text-[hsl(var(--muted-foreground))] active:cursor-grabbing', className)}
      tabIndex={overlay ? -1 : undefined}
      {...(handleProps ?? {})}
    >
      <GripVertical />
    </Button>
  )
}
