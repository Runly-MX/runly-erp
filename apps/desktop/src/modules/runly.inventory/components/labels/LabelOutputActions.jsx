import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, cn } from '@runly/ui'
import { ChevronDown, Download, Eye, ListChecks, Printer, SlidersHorizontal } from 'lucide-react'

const DOWNLOADS = [
  { format: 'pdf', label: 'PDF (todas las etiquetas)' },
  { format: 'zpl', label: 'ZPL para Zebra' },
  { format: 'png', label: 'PNG (primera etiqueta)' },
]

// "Imprimir" + "Descargar" menu. onPrint must run inside the click (the
// browser transport opens its tab synchronously).
export function LabelOutputActions({ plan, busy, disabled, onPrint, onDownload, className, stacked = false }) {
  return (
    <div className={cn('flex gap-2', stacked ? 'flex-col' : 'items-center', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" disabled={disabled || Boolean(busy)} className={stacked ? 'w-full' : undefined}>
            <Download className="mr-2 h-4 w-4" />{busy && busy !== 'print' ? 'Generando...' : 'Descargar'}<ChevronDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {DOWNLOADS.map((d) => (
            <DropdownMenuItem key={d.format} onSelect={() => onDownload(d.format)}>{d.label}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button type="button" onClick={onPrint} disabled={disabled || Boolean(busy) || !plan.available}
        title={plan.available ? undefined : plan.reason} className={stacked ? 'w-full' : undefined}>
        {plan.available && plan.label.startsWith('Descargar') ? <Download className="mr-2 h-4 w-4" /> : <Printer className="mr-2 h-4 w-4" />}
        {busy === 'print' ? 'Generando...' : plan.available ? plan.label : 'Disponible en la app'}
      </Button>
    </div>
  )
}

const STEPS = [
  { id: 'queue', label: 'Cola', icon: ListChecks },
  { id: 'preview', label: 'Vista previa', icon: Eye },
  { id: 'settings', label: 'Ajustes', icon: SlidersHorizontal },
  { id: 'print', label: 'Imprimir', icon: Printer },
]

// Phone-only fixed bottom bar that switches between the screen's steps.
export function LabelStepBar({ step, onStep, queueCount }) {
  return (
    <nav aria-label="Pasos de impresión"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="grid grid-cols-4">
        {STEPS.map(({ id, label, icon: Icon }) => {
          const active = step === id
          return (
            <button key={id} type="button" aria-current={active ? 'step' : undefined} onClick={() => onStep(id)}
              className={cn(
                'relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))]',
                active ? 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]',
              )}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
              {id === 'queue' && queueCount ? (
                <span className="absolute right-[calc(50%-1.4rem)] top-1 min-w-[1.1rem] rounded-md bg-[hsl(var(--primary))] px-1 text-[10px] leading-4 text-[hsl(var(--primary-foreground))]">{queueCount}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
