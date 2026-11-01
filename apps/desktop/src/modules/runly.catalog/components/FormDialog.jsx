// apps/desktop/src/modules/runly.catalog/components/FormDialog.jsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'

// House form dialog: fixed header (icon, title, description) and footer;
// only the body scrolls. `onSubmit` makes Enter submit the form.
export default function FormDialog({ open, onOpenChange, icon, tone, title, description, size = 'lg', onSubmit, footer, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size} scrollable className="p-0 md:p-0">
        <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(e) }} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="shrink-0 border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
            <DialogHeader icon={icon} tone={tone}>
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">{children}</div>
          <DialogFooter className="mt-0 shrink-0 gap-2 border-t border-[hsl(var(--border))] px-6 py-4">{footer}</DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
