import { FieldWrapper, cn } from '@runly/ui'

// Labeled 16:9 media box of the lesson editor (video and thumbnail cards):
// the box holds a dropzone, progress or a preview; `actions` go below it.
export function MediaCard({ label, required = false, error, hint, dashed = false, highlighted = false, className, actions = null, children, ...dropHandlers }) {
  return (
    <FieldWrapper label={label} required={required} error={error} hint={hint} className="min-w-0">
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-md border bg-[hsl(var(--muted)/0.5)]',
          dashed ? 'border-2 border-dashed border-[hsl(var(--border))]' : 'border-[hsl(var(--border))]',
          highlighted && 'border-primary bg-primary/6',
          error && 'border-[hsl(var(--destructive))]',
          className,
        )}
        {...dropHandlers}
      >
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </FieldWrapper>
  )
}
