import { useState } from 'react'
import { Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SegmentedControl, SelectField, SliderRow, cn } from '@runly/ui'
import { Download, FileText, Image as ImageIcon, Images, Monitor, Printer } from 'lucide-react'
import { DEFAULT_EXPORT, PRINT_PPI, SOURCE_PPI, defaultPpi, printSizeMm, safeScale } from '../../lib/studio-export.js'

const KEY = 'runly.studio.export-options'
const TYPES = [
  { value: 'png', label: 'PNG', hint: 'Pantallas y redes, sin pérdida', icon: ImageIcon, use: 'Pantalla' },
  { value: 'jpg', label: 'JPG', hint: 'Fotos y archivos ligeros', icon: Images, use: 'Pantalla' },
  { value: 'pdf', label: 'PDF para imprimir', hint: `${PRINT_PPI} ppp · RGB o CMYK · sangrado`, icon: Printer, use: 'Impresión' },
]
function remembered() {
  try { return { ...DEFAULT_EXPORT, ...JSON.parse(window.localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULT_EXPORT }
}

// "Descargar": screen (PNG/JPG, size, transparency, quality) or print (PDF at
// 300 ppp, RGB/CMYK, 3 mm bleed, crop marks). Choices are remembered per
// browser; credits are reviewed after this step, as before.
export function ExportDialog({ open, onOpenChange, page, exporting, onExport, onCredits }) {
  const [options, setOptions] = useState(remembered)
  const set = patch => setOptions(current => ({ ...current, ...patch }))
  const ppi = options.ppi ?? defaultPpi(page), size = printSizeMm(page, ppi)
  const scaled = factor => { try { const scale = safeScale(page, factor); return `${Math.round(page.width * scale)} × ${Math.round(page.height * scale)} px` } catch(error) { return error.message } }
  function submit() {
    try { window.localStorage.setItem(KEY, JSON.stringify(options)) } catch { /* storage unavailable */ }
    onExport({ ...options, ppi })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="flex max-h-[90dvh] flex-col">
        <DialogHeader icon={Download}>
          <DialogTitle>Descargar</DialogTitle>
          <DialogDescription>Elige si el diseño va a pantallas o a imprenta.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <div role="radiogroup" aria-label="Tipo de archivo" className="grid gap-2 sm:grid-cols-3">
            {TYPES.map(type => {
              const active = options.type === type.value, Icon = type.icon
              return (
                <button key={type.value} type="button" role="radio" aria-checked={active} onClick={() => set({ type: type.value })}
                  className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:flex-col sm:gap-2',
                    active ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]')}>
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', active ? 'bg-fuchsia-600 text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]')}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">{type.label}</span>
                    <span className="block text-xs text-[hsl(var(--muted-foreground))]">{type.hint}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--muted-foreground))]">{type.use === 'Pantalla' ? <Monitor className="h-3 w-3" /> : <Printer className="h-3 w-3" />}{type.use}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {options.type !== 'pdf' ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Tamaño</p>
                <SegmentedControl ariaLabel="Tamaño de exportación" value={String(options.scale)} onChange={value => set({ scale: Number(value) })} className="w-full [&_button]:min-w-0"
                  options={[1, 2, 3].map(factor => ({ value: String(factor), label: `×${factor}` }))} />
                <p className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{scaled(options.scale)}</p>
              </div>
              {options.type === 'png' ? <CheckboxField label="Fondo transparente" checked={options.transparent} onChange={event => set({ transparent: event.target.checked })}
                hint="Quita el color o degradado de la página; útil para logotipos y superposiciones." /> : null}
              {options.type === 'jpg' ? <SliderRow label="Calidad" min={50} max={100} zero={90} value={Math.round(options.quality * 100)} format={value => `${value} %`}
                onChange={value => set({ quality: value / 100 })} /> : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Perfil de color</p>
                <SegmentedControl ariaLabel="Perfil de color" value={options.profile} onChange={profile => set({ profile })} className="w-full [&_button]:min-w-0"
                  options={[{ value: 'cmyk', label: 'CMYK · imprenta' }, { value: 'rgb', label: 'RGB · digital' }]} />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{options.profile === 'cmyk'
                  ? 'PDF rasterizado con conversión CMYK genérica. No es PDF/X ni incorpora el perfil ICC de tu imprenta; confirma sus requisitos.'
                  : 'Conserva los colores de pantalla. Úsalo para impresión digital o si tu imprenta convierte los colores.'}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Resolución del diseño" value={String(ppi)} onValueChange={value => set({ ppi: Number(value) })}
                  options={SOURCE_PPI.map(value => ({ value: String(value), label: `${value} ppp` }))} />
                <div className="rounded-lg bg-[hsl(var(--muted)/0.6)] p-3 text-xs">
                  <p className="font-semibold"><FileText className="mr-1 inline h-3.5 w-3.5" />{size.width} × {size.height} mm</p>
                  <p className="mt-0.5 text-[hsl(var(--muted-foreground))]">Se genera a {PRINT_PPI} ppp. Si el tamaño no coincide con tu impreso, cambia las medidas del diseño.</p>
                </div>
              </div>
              <CheckboxField label="Sangrado de 3 mm" checked={options.bleed} onChange={event => set({ bleed: event.target.checked })}
                hint="Extiende el fondo y lo que toca los bordes 3 mm por fuera del corte, para que no queden filos blancos." />
              <CheckboxField label="Marcas de corte" checked={options.cropMarks} onChange={event => set({ cropMarks: event.target.checked })}
                hint="Añade guías en las esquinas para que la imprenta corte a la medida exacta." />
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={onCredits}>Créditos del diseño</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={exporting} className="gap-1.5"><Download className="h-4 w-4" />Descargar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
