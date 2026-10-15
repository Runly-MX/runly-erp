import { useEffect } from 'react'
import { Button, Popover, PopoverContent, PopoverTrigger, SwitchField, TextareaField, cn } from '@runly/ui'
import { Pin, Rows3, SlidersHorizontal, Square } from 'lucide-react'
import { MAX_BULK_SERIALS, parseSerials, pinnedValues, saveCapture } from '../lib/capture.js'

const MODES = [
  { multi: false, label: 'Un equipo', icon: Square },
  { multi: true, label: 'Varios por serie', icon: Rows3 },
]

// Capture bar for the new-asset form (RunlyForm renderTools slot). Pins live on
// each field (RunlyForm fieldPins); "Fijar campos" only shows/hides them.
// Pinned values are written to this browser on every change.
export function InventoryCaptureTools({ values, patchValues, disabled, settings, setSettings, storageKey, serialsText, setSerialsText }) {
  useEffect(() => {
    saveCapture(storageKey, { ...settings, values: pinnedValues(values, settings.pinned) })
  }, [storageKey, settings, values])

  // Hides serial/tag fields (blueprint hiddenWhen __multi) in bulk mode.
  useEffect(() => {
    if (Boolean(values.__multi) !== settings.multi) patchValues({ __multi: settings.multi })
  }, [settings.multi, values.__multi, patchValues])

  const update = (patch) => setSettings((prev) => ({ ...prev, ...patch }))
  const { serials, repeated } = parseSerials(serialsText)
  const overLimit = serials.length > MAX_BULK_SERIALS
  const pinnedCount = settings.pinned.length

  return (
    <section className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Modo de captura" className="inline-flex rounded-lg bg-[hsl(var(--muted))]/60 p-0.5">
          {MODES.map(({ multi, label, icon: Icon }) => {
            const active = settings.multi === multi
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => update({ multi })}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                  active
                    ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                )}
              >
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            )
          })}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant={settings.pinMode ? 'default' : 'outline'} disabled={disabled}>
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />Opciones de captura
              {pinnedCount > 0 || settings.continuous ? (
                <span className="ml-1.5 rounded-full bg-[var(--brand-primary)]/15 px-1.5 text-xs tabular-nums">{pinnedCount + (settings.continuous ? 1 : 0)}</span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-4">
            <div className="space-y-1.5">
              <Button type="button" size="sm" className="w-full justify-start" variant={settings.pinMode ? 'default' : 'outline'}
                aria-pressed={settings.pinMode} onClick={() => update({ pinMode: !settings.pinMode })}>
                <Pin className={cn('mr-1.5 h-3.5 w-3.5', pinnedCount > 0 && 'fill-current')} />
                {settings.pinMode ? 'Listo' : 'Fijar campos'}
                {pinnedCount > 0 ? <span className="ml-1.5 rounded-full bg-[var(--brand-primary)]/15 px-1.5 text-xs tabular-nums">{pinnedCount}</span> : null}
              </Button>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Los campos fijados conservan su valor al guardar, para capturar equipos parecidos.</p>
            </div>
            <div className="space-y-1.5">
              <SwitchField label="Captura continua" checked={settings.continuous}
                onChange={(continuous) => update({ continuous: Boolean(continuous) })} />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Después de guardar, se abre otro formulario en blanco en lugar de ir al detalle.</p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {settings.pinMode ? (
        <p className="rounded-lg bg-[var(--brand-primary)]/5 px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          Toca el pin de cada campo para fijarlo. Los campos fijados conservan su valor al guardar y al recargar la página en este navegador.
        </p>
      ) : null}

      {settings.multi ? (
        <div className="glass-shell-flat space-y-1.5 rounded-2xl p-4">
          <TextareaField
            label="Números de serie"
            rows={4}
            value={serialsText}
            disabled={disabled}
            placeholder="ABC123, ABC124, ABC125 o uno por línea"
            hint="Sepáralos con coma, espacio, punto y coma o salto de línea. Se crea un activo por serie con los datos de abajo, nombrado «Nombre · serie»."
            onChange={(e) => setSerialsText(e.target.value)}
          />
          <p className={cn('text-sm', overLimit ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]')}>
            <span className="font-medium tabular-nums text-[hsl(var(--foreground))]">{serials.length}</span> {serials.length === 1 ? 'serie' : 'series'}
            {repeated.length ? ` · ${repeated.length} repetida${repeated.length === 1 ? '' : 's'} (se omiten): ${repeated.slice(0, 5).join(', ')}${repeated.length > 5 ? '…' : ''}` : ''}
            {overLimit ? ` · máximo ${MAX_BULK_SERIALS} por captura` : ''}
          </p>
        </div>
      ) : null}
    </section>
  )
}
