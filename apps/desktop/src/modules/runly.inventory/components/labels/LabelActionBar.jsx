import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, cn } from '@runly/ui'
import { ChevronDown, Download, Eye, Loader2, Printer } from 'lucide-react'
import { plural } from './studio-ui.jsx'

const DOWNLOADS = [
  { format: 'pdf', label: 'PDF', hint: 'todas las etiquetas' },
  { format: 'zpl', label: 'ZPL', hint: 'para Zebra' },
  { format: 'png', label: 'PNG', hint: 'imagen de una etiqueta' },
]

export const MOBILE_STEPS = [
  { value: 'select', label: 'Seleccionar' },
  { value: 'design', label: 'Diseñar' },
  { value: 'print', label: 'Imprimir' },
]

function DownloadMenu({ busy, disabled, onDownload, compact }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-11" disabled={disabled || Boolean(busy)} aria-label="Descargar">
          <Download className={cn('h-4 w-4', !compact && 'mr-2')} />
          {compact ? null : <>{busy && busy !== 'print' ? 'Generando...' : 'Descargar'}<ChevronDown className="ml-1.5 h-3.5 w-3.5" /></>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        {DOWNLOADS.map((d) => (
          <DropdownMenuItem key={d.format} onSelect={() => onDownload(d.format)}>
            <span className="font-medium">{d.label}</span><span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">{d.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PrintButton({ plan, busy, disabled, onPrint, className }) {
  const download = plan.label.startsWith('Descargar')
  return (
    <Button type="button" className={cn('h-11 px-5', className)} onClick={onPrint} disabled={disabled || Boolean(busy)} title={plan.note ?? undefined}>
      {busy === 'print' ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : download ? <Download className="mr-2 h-4 w-4" /> : <Printer className="mr-2 h-4 w-4" />}
      {busy === 'print' ? 'Generando...' : plan.label}
    </Button>
  )
}

// Bottom bar: what will be printed + the primary action. Desktop: sticky at the
// bottom of the workspace. Phone: fixed, with the 3-step flow and safe areas.
export function LabelActionBar({
  assets, labels, reprinted, templateName, printerName, plan, busy, disabled, disabledReason,
  onPrint, onDownload, step, onStep, onPreview,
}) {
  const summary = assets ? `${plural(assets, 'activo', 'activos')} · ${plural(labels, 'etiqueta', 'etiquetas')}` : 'Sin activos seleccionados'
  const nextStep = step === 'select' ? 'design' : step === 'design' ? 'print' : null
  return (
    <>
      <div className="sticky bottom-0 z-30 hidden border-t border-[hsl(var(--border))] bg-[hsl(var(--card)/0.96)] backdrop-blur lg:block">
        <div className="flex items-center gap-4 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tabular-nums">{summary}</p>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
              {disabledReason ?? [templateName, printerName, reprinted ? `${plural(reprinted, 'ya etiquetado', 'ya etiquetados')} (se pedirá confirmación)` : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <DownloadMenu busy={busy} disabled={disabled} onDownload={onDownload} />
          <PrintButton plan={plan} busy={busy} disabled={disabled} onPrint={onPrint} />
        </div>
      </div>

      <nav aria-label="Pasos de impresión"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] lg:hidden">
        <div className="grid grid-cols-3 border-b border-[hsl(var(--border)/0.6)]">
          {MOBILE_STEPS.map((s, i) => {
            const active = s.value === step
            return (
              <button key={s.value} type="button" aria-current={active ? 'step' : undefined} onClick={() => onStep(s.value)}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))]',
                  active ? 'bg-(--brand-soft) text-(--brand-primary)' : 'text-[hsl(var(--muted-foreground))]',
                )}>
                <span className={cn('flex size-5 items-center justify-center rounded-md text-[11px] tabular-nums', active ? 'bg-(--brand-primary) text-(--brand-primary-foreground)' : 'bg-[hsl(var(--muted))]')}>{i + 1}</span>
                {s.label}
                {s.value === 'select' && assets ? <span className="tabular-nums">({assets})</span> : null}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label="Ver etiqueta" onClick={onPreview}>
            <Eye className="h-5 w-5" />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums">{summary}</p>
          {nextStep ? (
            <Button type="button" className="h-11 px-5" onClick={() => onStep(nextStep)}>
              {nextStep === 'design' ? 'Diseñar' : 'Continuar'}
            </Button>
          ) : (
            <>
              <DownloadMenu busy={busy} disabled={disabled} onDownload={onDownload} compact />
              <PrintButton plan={plan} busy={busy} disabled={disabled} onPrint={onPrint} />
            </>
          )}
        </div>
      </nav>
    </>
  )
}
