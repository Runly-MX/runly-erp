import { useParams } from 'react-router-dom'
import { Badge, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, cn } from '@runly/ui'
import { ENROLLMENT_STATUS_LABELS, ENROLLMENT_VARIANTS, STATUS_LABELS, STATUS_VARIANTS } from '../lib/lmsLabels.js'

// Second path segment of the module route ("/courses/:id", "/learn/:id").
export function useRouteId() {
  const { '*': wildcard } = useParams()
  return String(wildcard ?? '').split('/').filter(Boolean)[1] ?? null
}

export function PageShell({ children, className }) {
  return <div className={cn('mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6', className)}>{children}</div>
}

export function CourseStatusBadge({ status }) {
  return <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'}>{STATUS_LABELS[status] ?? status}</Badge>
}

export function EnrollmentStatusBadge({ status }) {
  return <Badge variant={ENROLLMENT_VARIANTS[status] ?? 'secondary'}>{ENROLLMENT_STATUS_LABELS[status] ?? status}</Badge>
}

// Right-hand form sheet: header and footer stay fixed, only the body scrolls.
// `wide` is for editors with lists (quiz questions, grading); `wide="xl"` for
// editors with a side preview (certificate templates).
export function FormSheet({ open, onOpenChange, title, description, children, footer, wide = false }) {
  const width = wide === 'xl' ? 'sm:max-w-6xl' : wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn('flex w-full flex-col gap-0 p-0', width)}>
        <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4 pr-12 max-md:pb-3 max-md:pr-5">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div data-dialog-footer="" className="flex shrink-0 items-center justify-end gap-2 border-t border-[hsl(var(--border))] px-5 py-3 max-md:py-2">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
