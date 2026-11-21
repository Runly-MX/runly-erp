import { useCallback, useState } from 'react'
import { BackButton, Button, ConfirmDialog, PageHeader, cn } from '@runly/ui'
import { Loader2 } from 'lucide-react'
import { useUnsavedNavigationGuard } from '../../lib/useUnsavedNavigationGuard.js'

const noop = () => {}

// Full-page editor for long Reservaciones forms: header with way back, sections
// in cards, an optional side column (summary/help, large screens only) and a
// sticky action bar that never covers the last field.
export function FormPage({ backLabel, onBack, eyebrow, title, description, aside, onSubmit, footer, children }) {
  return (
    // scroll-mb: focus and scrollIntoView stop above the sticky action bar, never under it.
    <form onSubmit={onSubmit} noValidate className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 px-4 pt-5 sm:px-6 sm:pt-6 [&_*]:scroll-mb-32">
      <div className="space-y-2">
        <BackButton onClick={onBack} label={backLabel} />
        <PageHeader eyebrow={eyebrow} title={title} description={description} />
      </div>
      <div className={cn('grid min-w-0 gap-5', aside && 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start')}>
        <div className="min-w-0 space-y-5">{children}</div>
        {aside ? <aside className="hidden min-w-0 space-y-4 lg:sticky lg:top-4 lg:block">{aside}</aside> : null}
      </div>
      {footer}
    </form>
  )
}

// One concept per card. Two-column grids live inside, never across cards.
export function FormSection({ icon: Icon, title, description, action, children, className }) {
  return (
    <section className={cn('rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6', className)}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

// Sticky bottom bar: status on the left (what is unsaved or still missing),
// actions on the right. Extra right padding on phones keeps the buttons clear
// of the MirAI edge tab; --sab clears the home indicator.
export function FormActionBar({ status, pending, submitLabel, pendingLabel = 'Guardando…', onCancel, cancelLabel = 'Cancelar' }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-1 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 px-4 pt-3 pb-[max(0.75rem,var(--sab))] backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--background))]/80 max-sm:pr-14 sm:mx-0 sm:rounded-t-xl sm:border-x sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-5 min-w-0 text-sm text-[hsl(var(--muted-foreground))]" aria-live="polite">{status}</div>
        <div className="flex gap-2 sm:shrink-0">
          <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={onCancel} disabled={pending}>{cancelLabel}</Button>
          <Button type="submit" className="flex-1 sm:flex-none" disabled={pending}>
            {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            {pending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Dirty-form protection for these pages: in-app links, back/forward and tab
// close ask before discarding; `leave` is for the page's own Cancel/Back and
// `commit` for navigating after a successful save.
export function useLeaveGuard(dirty) {
  const guard = useUnsavedNavigationGuard(dirty, noop)
  const [confirming, setConfirming] = useState(null)
  const leave = useCallback((go) => (dirty ? setConfirming(() => go) : go()), [dirty])
  const dialog = (
    <ConfirmDialog
      open={guard.pending || Boolean(confirming)}
      onOpenChange={(v) => { if (!v) { guard.cancel(); setConfirming(null) } }}
      title="¿Descartar los cambios?"
      description="Lo que capturaste en este formulario se perderá."
      confirmLabel="Descartar"
      cancelLabel="Seguir editando"
      onConfirm={() => {
        if (confirming) { const go = confirming; setConfirming(null); guard.finish(go) } else guard.proceed()
      }}
    />
  )
  return { leave, commit: guard.finish, dialog }
}
