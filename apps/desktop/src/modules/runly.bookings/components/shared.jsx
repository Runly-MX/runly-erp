import { useState } from 'react'
import { Button, EmptyState, SelectField, StatusPill, cn, useIsMobile } from '@runly/ui'
import { CalendarClock, ChevronDown, Plus, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { STATUS, bookingsPath } from '../lib/bookingsLabels.js'

export function PageShell({ children, className }) {
  return <div className={cn('mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6', className)}>{children}</div>
}

export function StatusBadge({ status, size = 'md' }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' }
  return <StatusPill tone={s.tone} size={size}>{s.label}</StatusPill>
}

export const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Picks the space a screen works on; only spaces the person can see are listed.
export function SpaceSwitcher({ spaces, value, onChange, className }) {
  const options = (spaces ?? []).filter((s) => s.enabled !== false).map((s) => ({ value: s.id, label: s.name }))
  return (
    <SelectField
      label="Sistema"
      className={cn('w-full sm:w-72', className)}
      options={options}
      value={value ?? ''}
      onValueChange={onChange}
      placeholder="Elige un sistema"
    />
  )
}

export function NoSpaces({ canCreate }) {
  const navigate = useNavigate()
  return (
    <EmptyState
      icon={CalendarClock}
      title="Todavía no tienes sistemas de reservaciones"
      description={canCreate ? 'Crea un sistema para definir servicios, horarios y recursos, y empezar a registrar reservaciones.' : 'Pide a un administrador que te agregue a un sistema de reservaciones.'}
      action={canCreate ? <Button type="button" onClick={() => navigate(bookingsPath('/spaces?new=1'))}><Plus />Nuevo sistema</Button> : undefined}
    />
  )
}

// Filter grid; on phones it folds behind one button so the content stays in view.
export function FiltersPanel({ active = 0, children, className }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  if (!isMobile) return <div className={className}>{children}</div>
  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" className="h-11 w-full justify-between" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="flex items-center gap-2"><SlidersHorizontal />Filtros{active ? ` (${active})` : ''}</span>
        <ChevronDown className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
      </Button>
      {open ? <div className={className}>{children}</div> : null}
    </div>
  )
}

// Titled group inside a dialog or sheet body, so long forms read as sections.
export function FormGroup({ title, description, children }) {
  return (
    <section className="space-y-3 border-t border-[hsl(var(--border))] pt-4 first:border-t-0 first:pt-0">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className={MUTED}>{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <p className={MUTED}>{label}</p>
      <div className="mt-0.5 text-sm font-medium break-words">{children}</div>
    </div>
  )
}
