import { useId, useState } from 'react'
import { Button, ChoiceCardGroup, NumberStepper, cn } from '@runly/ui'
import {
  AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
  AlignVerticalSpaceAround, ChevronDown,
} from 'lucide-react'
import {
  COMPOSITION_PRESETS, QR_SCALE, SPACING_MM, TEXT_ALIGN_OPTIONS, TEXT_VALIGN_OPTIONS, activeCompositionPreset, applyCompositionPreset,
  applyLayout, effectiveQrAlign, qrAlignOptions,
} from '../../lib/label-layout.js'
import { FieldHint, SegmentTabs } from './studio-ui.jsx'

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight }
const VALIGN_ICONS = { top: AlignVerticalJustifyStart, middle: AlignVerticalJustifyCenter, bottom: AlignVerticalJustifyEnd, spread: AlignVerticalSpaceAround }
const TEXT_ALIGNS = TEXT_ALIGN_OPTIONS.map((o) => ({ ...o, icon: ALIGN_ICONS[o.value] }))
const TEXT_VALIGNS = TEXT_VALIGN_OPTIONS.map((o) => ({ ...o, icon: VALIGN_ICONS[o.value] }))
const QR_SIZE_MODES = [{ value: 'auto', label: 'Automático' }, { value: 'custom', label: 'Personalizado' }]

function Control({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  )
}

function Stepper({ label, value, onChange, disabled, ...limits }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <NumberStepper value={value} onChange={onChange} label={label} disabled={disabled} {...limits} />
    </div>
  )
}

// Layout cards, quick presets and the text alignment always visible; QR size,
// QR position, margin and gap behind "Ajustes finos" (progressive disclosure).
export function LabelCompositionSection({ draft, onChange, layoutCards, disabled }) {
  const [fine, setFine] = useState(false)
  const fineId = useId()
  const hasText = draft.layout !== 'qr-only' && draft.fields.length > 0
  const hasQr = draft.layout !== 'text-only'
  const sideBySide = draft.layout === 'qr-left' || draft.layout === 'qr-top'
  const text = draft.textOptions ?? {}
  const setText = (patch) => onChange({ ...draft, textOptions: { ...text, ...patch } })
  const setQr = (patch) => onChange({ ...draft, qrOptions: { ...draft.qrOptions, ...patch } })
  const preset = activeCompositionPreset(draft)
  const qrAligns = qrAlignOptions(draft.layout)
  const scaled = draft.qrOptions?.scalePct != null

  return (
    <div className="space-y-4">
      <ChoiceCardGroup columns={4} ariaLabel="Distribución" options={layoutCards} value={draft.layout} disabled={disabled}
        onChange={(layout) => onChange(applyLayout(draft, layout))} />

      {hasText || qrAligns.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">Rápido:</span>
          {COMPOSITION_PRESETS.map((p) => (
            <Button key={p.value} type="button" size="sm" variant="outline" disabled={disabled} aria-pressed={preset === p.value}
              className={cn('h-11 lg:h-9', preset === p.value && 'border-transparent bg-(--brand-soft) font-semibold text-(--brand-primary) hover:bg-(--brand-soft)')}
              onClick={() => onChange(applyCompositionPreset(draft, p.value))}>
              {p.label}
            </Button>
          ))}
        </div>
      ) : null}

      {hasText ? (
        <>
          <Control label="Alineación del texto">
            <SegmentTabs ariaLabel="Alineación horizontal del texto" options={TEXT_ALIGNS} value={text.align ?? 'left'} size="touch" disabled={disabled}
              onChange={(align) => setText({ align })} />
          </Control>
          <Control label="Posición vertical del texto" hint={text.valign === 'spread' ? 'Repartir distribuye las líneas en toda el área de texto.' : null}>
            <SegmentTabs ariaLabel="Alineación vertical del texto" options={TEXT_VALIGNS} value={text.valign ?? 'middle'} size="touch" compactIcons disabled={disabled}
              onChange={(valign) => setText({ valign })} />
          </Control>
        </>
      ) : null}

      <div>
        <button type="button" aria-expanded={fine} aria-controls={fineId} onClick={() => setFine((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
          <span>Ajustes finos{!fine ? <span className="ml-1.5 text-xs font-normal">· {hasQr ? `QR ${scaled ? `${draft.qrOptions.scalePct} %` : 'automático'} · ` : ''}margen {Number(text.marginMm ?? 1.5)} mm</span> : null}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', fine && 'rotate-180')} aria-hidden="true" />
        </button>
        <div id={fineId} hidden={!fine} className="space-y-4 pt-2">
          {fine ? (
            <>
              {hasQr ? (
                <Control label="Tamaño del QR" hint={scaled ? 'Porcentaje del espacio máximo disponible para el código.' : 'El tamaño se calcula según la etiqueta y el texto.'}>
                  <SegmentTabs ariaLabel="Tamaño del QR" options={QR_SIZE_MODES} value={scaled ? 'custom' : 'auto'} size="touch" disabled={disabled}
                    onChange={(mode) => setQr({ scalePct: mode === 'custom' ? 90 : null })} />
                  {scaled ? (
                    <Stepper label="Tamaño (%)" value={draft.qrOptions.scalePct} min={QR_SCALE.min} max={QR_SCALE.max} step={QR_SCALE.step}
                      disabled={disabled} onChange={(scalePct) => setQr({ scalePct })} />
                  ) : null}
                </Control>
              ) : null}
              {qrAligns.length ? (
                <Control label="Posición del QR"
                  hint={draft.layout === 'qr-left' && effectiveQrAlign(draft) === 'center' && !scaled ? 'Centrado se nota al reducir el tamaño del QR.' : null}>
                  <SegmentTabs ariaLabel="Posición del QR" options={qrAligns} value={effectiveQrAlign(draft)} size="touch" disabled={disabled}
                    onChange={(align) => setQr({ align })} />
                </Control>
              ) : null}
              <div className="divide-y divide-[hsl(var(--border)/0.6)]">
                <Stepper label="Margen interior (mm)" value={Number(text.marginMm ?? 1.5)} min={SPACING_MM.min} max={SPACING_MM.max}
                  step={SPACING_MM.step} precision={1} disabled={disabled} onChange={(marginMm) => setText({ marginMm })} />
                {sideBySide && hasText ? (
                  <Stepper label="Separación QR y texto (mm)" value={Number(text.gapMm ?? 1.5)} min={SPACING_MM.min} max={SPACING_MM.max}
                    step={SPACING_MM.step} precision={1} disabled={disabled} onChange={(gapMm) => setText({ gapMm })} />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
