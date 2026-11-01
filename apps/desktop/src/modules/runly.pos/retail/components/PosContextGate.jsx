// apps/desktop/src/modules/runly.pos/retail/components/PosContextGate.jsx
import { useState } from 'react'
import { Alert, AlertDescription, Button, EmptyState, cn } from '@runly/ui'
import { ArrowLeft, Check, Monitor, Store, TriangleAlert, Utensils } from 'lucide-react'

const MODE = {
  RETAIL: { label: 'Tienda', icon: Store },
  RESTAURANT: { label: 'Restaurante', icon: Utensils },
  HYBRID: { label: 'Mixto', icon: Store },
}

// Explicit outlet → terminal choice. Even a single option is shown
// preselected and needs one confirming tap; nothing is entered implicitly.
export default function PosContextGate({ context, selection, notice, onOutlet, onTerminal, canConfigure }) {
  const outlets = context?.outlets ?? []
  const step = selection.outletId ? 'terminal' : 'outlet'
  const terminals = (context?.terminals ?? []).filter((t) => t.outletId === selection.outletId)
  const [picked, setPicked] = useState(() => (step === 'outlet' ? (outlets.length === 1 ? outlets[0].id : null) : terminals.length === 1 ? terminals[0].id : null))
  const outlet = outlets.find((o) => o.id === selection.outletId)

  if (step === 'outlet' && outlets.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="No hay sucursales disponibles"
        description={canConfigure ? 'Crea una sucursal y una caja en Administración para empezar a vender.' : 'Pide a un administrador que configure una sucursal y una caja.'}
      />
    )
  }
  if (step === 'terminal' && terminals.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <EmptyState icon={Monitor} title="Esta sucursal no tiene cajas" description="Pide a un administrador que agregue una caja a la sucursal, o elige otra sucursal." />
        <div className="flex justify-center"><Button variant="outline" size="lg" onClick={() => onOutlet(null)}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Elegir otra sucursal</Button></div>
      </div>
    )
  }

  const options = step === 'outlet'
    ? outlets.map((o) => ({ id: o.id, title: o.name, subtitle: MODE[o.mode]?.label ?? 'Sucursal', icon: MODE[o.mode]?.icon ?? Store }))
    : terminals.map((t) => ({ id: t.id, title: t.name, subtitle: outlet?.name ?? '', icon: Monitor }))

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-4">
      {notice && (
        <Alert variant="warning">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">Paso {step === 'outlet' ? 1 : 2} de 2</p>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{step === 'outlet' ? '¿En qué sucursal estás?' : '¿En qué caja vas a cobrar?'}</h1>
      </div>
      <div role="radiogroup" aria-label={step === 'outlet' ? 'Sucursales' : 'Cajas'} className="grid gap-3 sm:grid-cols-2">
        {options.map(({ id, title, subtitle, icon: Icon }) => {
          const active = picked === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPicked(id)}
              onDoubleClick={() => (step === 'outlet' ? onOutlet(id) : onTerminal(id))}
              className={cn(
                'flex min-h-20 items-center gap-4 rounded-2xl border bg-[hsl(var(--card))] p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2',
                active ? 'border-2 border-(--brand-primary) bg-(--brand-soft)' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]',
              )}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"><Icon className="h-6 w-6" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold text-[hsl(var(--foreground))]">{title}</span>
                <span className="block truncate text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</span>
              </span>
              {active && <Check className="h-6 w-6 shrink-0 text-(--brand-primary-text) dark:text-(--brand-primary-on-dark)" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {step === 'terminal' ? (
          <Button variant="outline" size="lg" onClick={() => onOutlet(null)}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Cambiar sucursal</Button>
        ) : <span />}
        <Button size="lg" className="h-14 min-w-48 text-base font-bold" disabled={!picked} onClick={() => (step === 'outlet' ? onOutlet(picked) : onTerminal(picked))}>
          {step === 'outlet' ? 'Continuar' : 'Usar esta caja'}
        </Button>
      </div>
    </div>
  )
}
