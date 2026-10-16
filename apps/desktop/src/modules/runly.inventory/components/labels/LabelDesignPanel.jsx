import { useState } from 'react'
import { ChoiceCardGroup, NumberField, SelectField } from '@runly/ui'
import { FileOutput, LayoutPanelLeft, QrCode, Ruler, Type } from 'lucide-react'
import {
  CONTENT_MODE_OPTIONS, DPI_OPTIONS, ERROR_CORRECTION_OPTIONS, FIELD_OPTIONS, LAYOUT_OPTIONS, SIZE_PRESETS, presetFor,
} from '../../lib/label-layout.js'
import { LabelCompositionSection } from './LabelCompositionSection.jsx'
import { LabelContentSection } from './LabelContentSection.jsx'
import { LabelOutputSection } from './LabelOutputSection.jsx'
import { LabelPrinterSelect } from './LabelPrinterSelect.jsx'
import { FieldHint, StudioSection } from './studio-ui.jsx'

const QR = 'h-5 w-5 shrink-0 rounded-[2px] bg-current'
const LINES = (
  <span className="flex min-w-0 flex-1 flex-col gap-1">
    <span className="h-1 w-full rounded-full bg-current opacity-70" />
    <span className="h-1 w-3/4 rounded-full bg-current opacity-40" />
    <span className="h-1 w-1/2 rounded-full bg-current opacity-40" />
  </span>
)
const FRAME = 'flex h-9 w-14 rounded-sm border border-current/30'
const LAYOUT_PREVIEWS = {
  'qr-left': <span className={`${FRAME} items-center gap-1.5 p-1.5`} aria-hidden="true"><span className={QR} />{LINES}</span>,
  'qr-top': <span className={`${FRAME} flex-col items-center gap-1 p-1`} aria-hidden="true"><span className="h-4 w-4 rounded-[2px] bg-current" /><span className="h-1 w-8 rounded-full bg-current opacity-60" /></span>,
  'qr-only': <span className={`${FRAME} items-center justify-center p-1`} aria-hidden="true"><span className="h-6 w-6 rounded-[2px] bg-current" /></span>,
  'text-only': <span className={`${FRAME} items-center p-1.5`} aria-hidden="true">{LINES}</span>,
}
const LAYOUT_CARDS = LAYOUT_OPTIONS.map((o) => ({ value: o.value, label: o.label, preview: LAYOUT_PREVIEWS[o.value] }))
const SIZE_CARDS = SIZE_PRESETS.map((p) => ({ value: p.value, label: p.label, description: p.hint }))
const ALIGN_SUMMARY = { left: 'a la izquierda', center: 'centrado', right: 'a la derecha' }
const fieldLabel = (key) => FIELD_OPTIONS.find((f) => f.value === key)?.label ?? key

// Design column: printer and size, composition, content, QR and output, as
// collapsible sections (QR options start collapsed). When the column is wide
// (container >= 54rem, column ~900 px) the sections flow in two columns: size/content/output
// on the left, composition/QR on the right; narrower it is one column in order.
export function LabelDesignPanel({
  draft, onDraftChange, output, onOutputChange, labelCount, printers, printerId, onPrinterChange, plan, canManage, busy, onManagePrinters,
}) {
  const sizePreset = presetFor(draft.widthMm, draft.heightMm)
  const [customSize, setCustomSize] = useState(sizePreset === 'custom')
  const preset = customSize ? 'custom' : sizePreset
  const set = (patch) => onDraftChange({ ...draft, ...patch })
  const setQr = (patch) => onDraftChange({ ...draft, qrOptions: { ...draft.qrOptions, ...patch } })
  const layoutLabel = LAYOUT_OPTIONS.find((o) => o.value === draft.layout)?.label
  const alignLabel = ALIGN_SUMMARY[draft.textOptions?.align]
  const compositionSummary = draft.layout === 'qr-only' || !alignLabel ? layoutLabel : `${layoutLabel} · texto ${alignLabel}`
  const hasText = draft.layout !== 'qr-only'
  const hasQr = draft.layout !== 'text-only'

  return (
    <div className="@container">
      <div className="flex flex-col @[54rem]:grid @[54rem]:grid-cols-2 @[54rem]:items-start @[54rem]:gap-x-8">
        <div className="contents @[54rem]:block">
          <StudioSection className="order-1 @[54rem]:order-none" title="Tamaño e impresora" icon={Ruler} summary={`${Number(draft.widthMm)} × ${Number(draft.heightMm)} mm · ${draft.dpi} dpi`}>
            <LabelPrinterSelect printers={printers} printerId={printerId} onChange={onPrinterChange} plan={plan}
              canManage={canManage} busy={busy} onManage={onManagePrinters} />
            <div className="space-y-2">
              <p className="text-sm font-medium" id="label-size-title">Tamaño de la etiqueta</p>
              <ChoiceCardGroup columns={3} size="sm" ariaLabel="Tamaño de la etiqueta" options={SIZE_CARDS} value={preset} disabled={busy}
                className="grid-cols-2 sm:grid-cols-3"
                onChange={(value) => {
                  const p = SIZE_PRESETS.find((s) => s.value === value)
                  setCustomSize(!p?.widthMm)
                  if (p?.widthMm) set({ widthMm: p.widthMm, heightMm: p.heightMm })
                }} />
              {preset === 'custom' ? (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Ancho (mm)" min={10} max={300} allowNegative={false} value={draft.widthMm} disabled={busy}
                    onChange={(e) => set({ widthMm: e.target.value })} />
                  <NumberField label="Alto (mm)" min={10} max={300} allowNegative={false} value={draft.heightMm} disabled={busy}
                    onChange={(e) => set({ heightMm: e.target.value })} />
                </div>
              ) : null}
            </div>
            <SelectField label="Resolución de la impresora" options={DPI_OPTIONS} value={String(draft.dpi)} disabled={busy || Boolean(printerId)}
              onValueChange={(v) => set({ dpi: Number(v) })} />
            {printerId ? <FieldHint>Se usa la resolución configurada en la impresora.</FieldHint> : null}
          </StudioSection>

          {hasText ? (
            <StudioSection className="order-3 @[54rem]:order-none" title="Contenido" icon={Type}
              summary={draft.fields.length ? draft.fields.map(fieldLabel).join(', ') : 'Sin campos'}>
              <LabelContentSection draft={draft} onChange={onDraftChange} disabled={busy} />
            </StudioSection>
          ) : null}

          <StudioSection className="order-5 @[54rem]:order-none" title="Salida" icon={FileOutput} summary={output.mode === 'sheet' ? `Hoja carta ${output.sheet.columns} × ${output.sheet.rows}` : 'Rollo, una por etiqueta'}>
            <LabelOutputSection output={output} onChange={onOutputChange} draft={draft} labelCount={labelCount} plan={plan} disabled={busy} />
          </StudioSection>
        </div>

        <div className="contents @[54rem]:block">
          <StudioSection className="order-2 @[54rem]:order-none" title="Composición" icon={LayoutPanelLeft} summary={compositionSummary}>
            <LabelCompositionSection draft={draft} onChange={onDraftChange} layoutCards={LAYOUT_CARDS} disabled={busy} />
          </StudioSection>

          {hasQr ? (
            <StudioSection className="order-4 @[54rem]:order-none" title="Código QR" icon={QrCode} defaultOpen={false}
              summary={`${CONTENT_MODE_OPTIONS.find((o) => o.value === draft.qrOptions.contentMode)?.label} · corrección ${draft.qrOptions.errorCorrection}`}>
              <SelectField label="Contenido del QR" options={CONTENT_MODE_OPTIONS} value={draft.qrOptions.contentMode} disabled={busy}
                onValueChange={(contentMode) => setQr({ contentMode })} />
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Corrección de errores" options={ERROR_CORRECTION_OPTIONS} value={draft.qrOptions.errorCorrection} disabled={busy}
                  onValueChange={(errorCorrection) => setQr({ errorCorrection })} />
                <NumberField label="Margen del QR (mm)" min={0} max={10} allowNegative={false} value={draft.qrOptions.quietZoneMm} disabled={busy}
                  onChange={(e) => setQr({ quietZoneMm: e.target.value })} />
              </div>
              <FieldHint>«Enlace al activo» abre la página pública del equipo al escanear. Más corrección resiste rayones, pero hace el código más denso.</FieldHint>
            </StudioSection>
          ) : null}
        </div>
      </div>
    </div>
  )
}
