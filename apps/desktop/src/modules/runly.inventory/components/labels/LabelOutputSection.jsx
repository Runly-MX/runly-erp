import { Button, NumberStepper, SwitchField } from '@runly/ui'
import { FileText, Maximize2, ScrollText } from 'lucide-react'
import { LETTER, SHEET_LIMITS, autoSheet, sheetCells, sheetFit, sheetPages } from '../../lib/label-sheet.js'
import { FieldHint, SegmentTabs, plural } from './studio-ui.jsx'

const MODES = [
  { value: 'roll', label: 'Rollo', icon: ScrollText },
  { value: 'sheet', label: 'Hoja carta', icon: FileText },
]

// Letter page drawn to scale with the grid of labels (first page of the run).
function SheetPreview({ sheet, widthMm, heightMm, labelCount }) {
  const cells = sheetCells(sheet, widthMm, heightMm)
  const used = Math.min(cells.length, Math.max(labelCount, 0))
  return (
    <svg viewBox={`0 0 ${LETTER.widthMm} ${LETTER.heightMm}`} role="img"
      aria-label={`Hoja carta con ${cells.length} etiquetas por página`}
      className="h-auto w-28 shrink-0 rounded-[3px] bg-white shadow-sm ring-1 ring-black/10">
      <rect x={sheet.marginMm} y={sheet.marginMm} width={LETTER.widthMm - 2 * sheet.marginMm} height={LETTER.heightMm - 2 * sheet.marginMm}
        fill="none" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="3 3" />
      {cells.map((cell, i) => (
        <rect key={i} x={cell.x} y={cell.y} width={widthMm} height={heightMm} rx="1"
          fill={i < used ? 'var(--brand-soft)' : '#f1f5f9'} stroke={i < used ? 'var(--brand-primary)' : '#cbd5e1'} strokeWidth="0.6" />
      ))}
    </svg>
  )
}

function Stepper({ label, value, onChange, limits, disabled, suffix }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}{suffix ? ` (${suffix})` : ''}</p>
      <NumberStepper size="sm" value={value} min={limits.min} max={limits.max} onChange={onChange} label={label} disabled={disabled} />
    </div>
  )
}

// Salida: roll (one label per page/label) or a letter sheet grid (PDF only).
export function LabelOutputSection({ output, onChange, draft, labelCount, plan, disabled }) {
  const w = Number(draft.widthMm)
  const h = Number(draft.heightMm)
  const sheet = output.sheet
  const fit = sheetFit(sheet, w, h)
  const pages = sheetPages(labelCount, fit.perPage)
  const setSheet = (patch) => onChange({ ...output, sheet: { ...sheet, ...patch } })
  const pdfOutput = plan.format === 'pdf'

  return (
    <div className="space-y-4">
      <SegmentTabs ariaLabel="Salida" options={MODES} value={output.mode} disabled={disabled} onChange={(mode) => onChange({ ...output, mode })} />
      {output.mode === 'roll' ? (
        <FieldHint>Una etiqueta por página al tamaño exacto ({w} × {h} mm): para impresoras térmicas de rollo.</FieldHint>
      ) : (
        <>
          {!pdfOutput ? (
            <FieldHint tone="warning">La hoja carta solo aplica al PDF. Con esta impresora ({plan.format.toUpperCase()}) se imprime en rollo; elige «Navegador (PDF)» o descarga el PDF.</FieldHint>
          ) : null}
          <div className="flex gap-4">
            <SheetPreview sheet={sheet} widthMm={w} heightMm={h} labelCount={labelCount} />
            <div className="grid min-w-0 flex-1 grid-cols-2 content-start gap-3">
              <Stepper label="Columnas" value={sheet.columns} limits={SHEET_LIMITS.columns} disabled={disabled} onChange={(columns) => setSheet({ columns })} />
              <Stepper label="Filas" value={sheet.rows} limits={SHEET_LIMITS.rows} disabled={disabled} onChange={(rows) => setSheet({ rows })} />
              <Stepper label="Separación" suffix="mm" value={sheet.gapMm} limits={SHEET_LIMITS.gapMm} disabled={disabled} onChange={(gapMm) => setSheet({ gapMm })} />
              <Stepper label="Margen" suffix="mm" value={sheet.marginMm} limits={SHEET_LIMITS.marginMm} disabled={disabled} onChange={(marginMm) => setSheet({ marginMm })} />
            </div>
          </div>
          {fit.fits ? (
            <FieldHint>
              {plural(fit.perPage, 'etiqueta', 'etiquetas')} por hoja{labelCount ? ` · ${plural(pages, 'hoja', 'hojas')} para ${plural(labelCount, 'etiqueta', 'etiquetas')}` : ''}. Imprime al 100 %, sin ajustar a la página.
            </FieldHint>
          ) : (
            <FieldHint tone="error">No caben: {fit.reason}</FieldHint>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9" disabled={disabled}
              onClick={() => onChange({ ...output, sheet: autoSheet(sheet, w, h) })}>
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />Llenar la hoja ({fit.max.columns} × {fit.max.rows})
            </Button>
          </div>
          <SwitchField label="Guías de corte" description="Contorno gris claro alrededor de cada etiqueta."
            checked={Boolean(sheet.guides)} disabled={disabled} onChange={(v) => setSheet({ guides: Boolean(v) })} />
        </>
      )}
    </div>
  )
}
