import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../Dialog.jsx'
import { cn } from '../../lib/utils.js'

// Shared frame of the template dialogs: header and footer stay fixed, only the
// body scrolls, the subtitle is one short line and the footer buttons wrap
// instead of overflowing. Secondary explanations belong in the body as a hint.
export function TemplateDialogFrame({ open, onOpenChange, size = 'lg', icon: Icon, title, subtitle, footer, bodyClassName, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size} scrollable className="p-0 md:p-0">
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4 pr-12">
          <div className="flex items-start gap-3">
            {Icon ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary" aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <DialogTitle className="truncate leading-tight">{title}</DialogTitle>
              {subtitle ? <DialogDescription className="text-xs">{subtitle}</DialogDescription> : null}
            </div>
          </div>
        </div>
        <div className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>
        {footer ? (
          <DialogFooter className="mt-0 shrink-0 flex-wrap justify-end gap-2 border-t border-[hsl(var(--border))] px-5 py-3 sm:flex-row sm:flex-wrap sm:justify-end">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// Small muted explanation inside a dialog body.
export function DialogHint({ children, className }) {
  return <p className={cn('text-xs text-[hsl(var(--muted-foreground))]', className)}>{children}</p>
}
