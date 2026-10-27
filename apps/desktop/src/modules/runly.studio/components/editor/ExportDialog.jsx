import { useMemo, useRef, useState } from 'react'
import { Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SegmentedControl, SelectField, SliderRow, TextField, cn } from '@runly/ui'
import { AlertTriangle, Download, Image as ImageIcon, Images, Info, Loader2, PackageOpen, Printer } from 'lucide-react'
import { DEFAULT_EXPORT, SOURCE_PPI, defaultPpi } from '../../lib/studio-export.js'
import { PRINT_PPI, megapixels, mm, pixels, planExport, planPdfPages } from '../../lib/studio-export-plan.js'
import { parsePageRange } from '../../lib/studio-pages.js'

const KEY = 'runly.studio.export-options'
const TYPES = [
  { value: 'png', label: 'PNG', purpose: 'Gráficos y logotipos', hint: 'Sin pérdida de calidad. Admite fondo transparente.', icon: ImageIcon },
  { value: 'jpg', label: 'JPG', purpose: 'Fotografías', hint: 'Archivo ligero con calidad ajustable. Sin transparencia.', icon: Images },
  { value: 'pdf', label: 'PDF para imprimir', purpose: 'Imprenta', hint: `Medidas en mm, ${PRINT_PPI} ppp, sangrado y marcas de corte.`, icon: Printer },
]
// Only offered when the API publishes the package contract (packageExport).
const PACKAGE_TYPE = { value: 'runlystudio', label: 'Proyecto Studio', purpose: 'Editable en Studio', hint: 'Paquete .runlystudio: conserva páginas, texto y formas para seguir editando.', icon: PackageOpen }
function remembered() {
  try { return { ...DEFAULT_EXPORT, ...JSON.parse(window.localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULT_EXPORT }
}

// Exactly what the download will produce, from the same limits the editor enforces.
const sameSheet = items => items.every(({ plan }) => plan.size && plan.sheet.width === items[0].plan.sheet.width && plan.sheet.height === items[0].plan.sheet.height && plan.size.width === items[0].plan.size.width && plan.size.height === items[0].plan.size.height)

function printRows(plan) {
  return [['Medida de corte', `${mm(plan.trim.width)} × ${mm(plan.trim.height)}`],
    ...(plan.bleedMm || plan.sheet.width !== plan.trim.width ? [['Hoja del PDF', `${mm(plan.sheet.width)} × ${mm(plan.sheet.height)}`]] : []),
    ...(plan.size ? [['Imagen incrustada', `${pixels(plan.size)} a ${plan.ppi} ppp`]] : [])]
}

function Result({ options, plan }) {
  const multi = plan.kind === 'print-pages' && plan.items.length > 1
  const uniform = plan.kind === 'print-pages' && plan.items.length > 0 && sameSheet(plan.items)
  const rows = plan.kind === 'print-pages'
    ? [...(multi ? [['Páginas', `${plan.items.length} en orden del diseño`]] : []), ...(uniform || plan.items.length === 1 ? printRows(plan.items[0].plan) : []),
      ...(multi && plan.total ? [['Total a procesar', `${(plan.total / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 })} MP a ${PRINT_PPI} ppp`]] : [])]
    : plan.size ? [['Tamaño final', `${pixels(plan.size)} · ${megapixels(plan.size)}`]] : []
  return (
    <div role="status" aria-live="polite" className={cn('rounded-lg border px-3 py-2 text-xs sm:text-sm', plan.error ? 'border-[hsl(var(--destructive)/0.5)] bg-[hsl(var(--destructive)/0.06)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)]')}>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {plan.error ? <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--destructive))]" aria-hidden /> : null}Se generará {options.type === 'pdf' ? 'un PDF' : `un ${options.type.toUpperCase()}`}
      </p>
      <dl className="space-y-0.5">
        {rows.map(([term, value]) => <div key={term} className="flex flex-wrap justify-between gap-x-3"><dt className="text-[hsl(var(--muted-foreground))]">{term}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}
      </dl>
      {multi && !uniform && !plan.error ? (
        <ul tabIndex={0} aria-label="Medidas por página" className="mt-1 max-h-20 space-y-0.5 overflow-y-auto text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
          {plan.items.map(({ entry, plan: each }) => <li key={entry.id} className="flex justify-between gap-3"><span className="truncate text-[hsl(var(--muted-foreground))]">{entry.label}</span><span className="shrink-0 tabular-nums">{mm(each.trim.width)} × {mm(each.trim.height)}</span></li>)}
        </ul>
      ) : null}
      {plan.error ? <p className="mt-1 text-sm text-[hsl(var(--destructive))]">{plan.error} Descargar se activa cuando el tamaño es admitido.</p> : null}
    </div>
  )
}

// "Descargar": screen (PNG/JPG: size, transparency, quality) or print (PDF at
// 300 ppp, RGB/CMYK, 3 mm bleed, crop marks). Choices are remembered per
// browser; credits are reviewed after this step, as before.
export function ExportDialog({ open, onOpenChange, page, pages = [], pageCount = 1, exporting, onExport, onCredits, packageExport = null }) {
  const [stored, setOptions] = useState(remembered), group = useRef(null), [acknowledged, setAcknowledged] = useState(false)
  const types = useMemo(() => (packageExport ? [...TYPES, PACKAGE_TYPE] : TYPES), [packageExport])
  // A remembered or stale choice that is no longer offered falls back to PNG.
  const options = useMemo(() => (types.some(type => type.value === stored.type) ? stored : { ...stored, type: 'png' }), [stored, types])
  const native = options.type === 'runlystudio'
  const [scope, setScope] = useState('all'), [range, setRange] = useState('')
  const entries = useMemo(() => (pages.length ? pages : [{ ...page, id: 'page-1', active: true, label: 'Página 1' }]).map(item => ({ ...item, label: pages.length > 1 ? item.label : '', ppiDefault: defaultPpi(item) })), [pages, page])
  const multiple = entries.length > 1
  const parsed = useMemo(() => (scope === 'range' ? parsePageRange(range, entries.map(item => item.id)) : null), [scope, range, entries])
  const selected = scope === 'current' || !multiple ? entries.filter(item => item.active || !multiple) : scope === 'all' ? entries : entries.filter(item => parsed?.ids?.includes(item.id))
  // The consent is per download: choosing another type always asks again.
  const set = patch => { if (patch.type) setAcknowledged(false); setOptions(current => ({ ...current, ...patch })) }
  const ppi = options.ppi ?? defaultPpi(page)
  const plan = useMemo(() => {
    if (native) return { kind: 'package' }
    if (options.type !== 'pdf') return planExport(page, { ...options, ppi })
    const base = planPdfPages(selected, options)
    return scope === 'range' && parsed?.error ? { ...base, error: parsed.error, items: [] } : base
  }, [page, options, ppi, selected, scope, parsed, native])
  function submit() {
    if (plan.error || exporting || (native && !acknowledged)) return
    if (native) { onExport({ type: 'runlystudio', acknowledgeImageCopies: true }); return }
    try { window.localStorage.setItem(KEY, JSON.stringify(options)) } catch { /* storage unavailable */ }
    onExport({ ...options, ppi: options.type === 'pdf' ? options.ppi : ppi, ...(options.type === 'pdf' ? { pageIds: selected.map(item => item.id) } : {}) })
  }
  function arrows(event) {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!delta) return
    event.preventDefault()
    const next = types[(types.findIndex(type => type.value === options.type) + delta + types.length) % types.length]
    set({ type: next.value })
    requestAnimationFrame(() => group.current?.querySelector('[aria-checked="true"]')?.focus())
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="flex max-h-[90dvh] flex-col">
        <DialogHeader icon={Download}>
          <DialogTitle>Descargar</DialogTitle>
          <DialogDescription>Elige el formato según el uso del archivo.{multiple ? ` Este diseño tiene ${pageCount} páginas.` : ''}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <div ref={group} role="radiogroup" aria-label="Tipo de archivo" onKeyDown={arrows} className={cn('grid gap-2', packageExport ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
            {types.map(type => {
              const active = options.type === type.value, Icon = type.icon
              return (
                <button key={type.value} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} onClick={() => set({ type: type.value })}
                  className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:flex-col sm:gap-2',
                    active ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]')}>
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', active ? 'bg-fuchsia-600 text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]')}><Icon className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{type.label}</span>
                    <span className="block text-xs font-medium">{type.purpose}</span>
                    <span className="mt-0.5 block text-xs text-[hsl(var(--muted-foreground))]">{type.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {native ? (
            <div className="space-y-4">
              <p className="flex gap-2 rounded-md bg-[hsl(var(--muted)/0.5)] p-2.5 text-xs text-[hsl(var(--muted-foreground))]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>PNG, JPG y PDF sirven sobre todo para ver o imprimir. El paquete .runlystudio conserva el diseño completo{multiple ? ` (${pageCount} páginas)` : ''} para abrirlo y editarlo de nuevo en Studio.</span>
              </p>
              <div role="note" className="space-y-2 rounded-lg border border-amber-400/50 bg-amber-400/10 p-3 text-sm text-amber-900 dark:text-amber-100">
                <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />{packageExport.imageCount ? `Incluye copias de ${packageExport.imageCount} ${packageExport.imageCount === 1 ? 'imagen original' : 'imágenes originales'}` : 'Revisa el contenido antes de compartirlo'}</p>
                <p className="text-xs sm:text-sm">{packageExport.notice}</p>
              </div>
              <CheckboxField label={packageExport.imageCount ? 'Entiendo que el paquete incluye copias completas de las imágenes originales, también las ocultas o recortadas.' : 'Entiendo que el paquete incluye el texto del diseño y puede contener información personal.'}
                checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
            </div>
          ) : options.type !== 'pdf' ? (
            <div className="space-y-4">
              {multiple ? <p className="flex gap-2 rounded-md bg-[hsl(var(--muted)/0.5)] p-2.5 text-xs text-[hsl(var(--muted-foreground))]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{options.type.toUpperCase()} descarga una sola página: {entries.find(item => item.active)?.label}. Para varias páginas en un archivo elige PDF para imprimir.</span></p> : null}
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Tamaño</p>
                <SegmentedControl ariaLabel="Tamaño de exportación" value={String(options.scale)} onChange={value => set({ scale: Number(value) })} className="w-full [&_button]:min-w-0"
                  options={[1, 2, 3].map(factor => ({ value: String(factor), label: `×${factor}` }))} />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">×1 es el tamaño del diseño ({page.width} × {page.height} px); ×2 y ×3 lo amplían para pantallas de alta densidad.</p>
              </div>
              {options.type === 'png' ? <CheckboxField label="Fondo transparente" checked={options.transparent} onChange={event => set({ transparent: event.target.checked })}
                hint="Quita el color o degradado de la página; útil para logotipos y superposiciones." /> : null}
              {options.type === 'jpg' ? <SliderRow label="Calidad" min={50} max={100} zero={90} value={Math.round(options.quality * 100)} format={value => `${value} %`}
                onChange={value => set({ quality: value / 100 })} /> : null}
              {options.type === 'jpg' ? <p className="-mt-2 text-xs text-[hsl(var(--muted-foreground))]">Más calidad conserva más detalle y pesa más. El peso final depende de la imagen.</p> : null}
            </div>
          ) : (
            <div className="space-y-4">
              {multiple ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Páginas</p>
                  <SegmentedControl ariaLabel="Páginas a incluir" value={scope} onChange={setScope} className="w-full [&_button]:min-w-0"
                    options={[{ value: 'current', label: 'Actual' }, { value: 'all', label: `Todas (${entries.length})` }, { value: 'range', label: 'Rango' }]} />
                  {scope === 'range' ? <TextField id="studio-export-range" label="Rango de páginas" value={range} placeholder="1-3, 5" autoComplete="off" onChange={event => setRange(event.target.value)}
                    hint={`Del 1 al ${entries.length}. Se incluyen en el orden del diseño.`} error={parsed?.error && range.trim() ? parsed.error : undefined} /> : null}
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{scope === 'current' ? `Solo ${entries.find(item => item.active)?.label}.` : scope === 'all' ? 'Todas las páginas, cada una con sus propias medidas.' : 'Solo las páginas del rango.'}</p>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Perfil de color</p>
                <SegmentedControl ariaLabel="Perfil de color" value={options.profile} onChange={profile => set({ profile })} className="w-full [&_button]:min-w-0"
                  options={[{ value: 'cmyk', label: 'CMYK' }, { value: 'rgb', label: 'RGB' }]} />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{options.profile === 'cmyk'
                  ? 'Usa una conversión genérica de RGB a CMYK, no el perfil ICC de tu imprenta. Los colores muy brillantes pueden verse más apagados. Si tu imprenta pide un perfil ICC concreto, descarga en RGB y conviértelo con el suyo.'
                  : 'Conserva los colores de pantalla. Úsalo para impresión digital o si tu imprenta convierte los colores.'}</p>
              </div>
              <div className="space-y-1.5">
                <SelectField label="Resolución del diseño" value={options.ppi == null && multiple ? 'auto' : String(ppi)} onValueChange={value => set({ ppi: value === 'auto' ? null : Number(value) })}
                  options={[...(multiple ? [{ value: 'auto', label: 'Según el tamaño de cada página' }] : []), ...SOURCE_PPI.map(value => ({ value: String(value), label: `${value} ppp` }))]} />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Cuántos píxeles del diseño caben en una pulgada: define la medida impresa. Si no coincide con tu impreso, cambia las medidas del diseño.</p>
              </div>
              <CheckboxField label="Sangrado de 3 mm" checked={options.bleed} onChange={event => set({ bleed: event.target.checked })}
                hint="Extiende el fondo y lo que toca los bordes 3 mm por fuera del corte, para que no queden filos blancos." />
              <CheckboxField label="Marcas de corte" checked={options.cropMarks} onChange={event => set({ cropMarks: event.target.checked })}
                hint="Añade guías en las esquinas para que la imprenta corte a la medida exacta." />
              <p className="flex gap-2 rounded-md bg-[hsl(var(--muted)/0.5)] p-2.5 text-xs text-[hsl(var(--muted-foreground))]">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>El diseño se incrusta como imagen de {PRINT_PPI} ppp con TrimBox y BleedBox. No es un PDF vectorial ni cumple PDF/X.</span>
              </p>
            </div>
          )}
        </div>
        {native ? null : <div className="shrink-0"><Result options={options} plan={plan} /></div>}
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={onCredits}>Créditos del diseño</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={exporting || Boolean(plan.error) || (native && !acknowledged)} className="gap-1.5">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}Descargar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
