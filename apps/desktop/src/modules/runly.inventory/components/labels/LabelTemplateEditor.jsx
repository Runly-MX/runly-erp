import { useState } from 'react'
import { Button, CheckboxField, ChoiceCardGroup, NumberField, SelectField } from '@runly/ui'
import { ArrowDown, ArrowUp } from 'lucide-react'
import {
  CONTENT_MODE_OPTIONS, DPI_OPTIONS, ERROR_CORRECTION_OPTIONS, FIELD_OPTIONS, LAYOUT_OPTIONS, SIZE_PRESETS,
  moveField, presetFor, toggleField,
} from '../../lib/label-layout.js'

const QR = 'h-5 w-5 shrink-0 rounded-[2px] bg-current'
const LINES = (
  <span className="flex min-w-0 flex-1 flex-col gap-1">
    <span className="h-1 w-full rounded-full bg-current opacity-70" />
    <span className="h-1 w-3/4 rounded-full bg-current opacity-40" />
    <span className="h-1 w-1/2 rounded-full bg-current opacity-40" />
  </span>
)

// Small drawings of each distribution for the layout cards.
const LAYOUT_PREVIEWS = {
  'qr-left': <span className="flex h-9 w-14 items-center gap-1.5 rounded-sm border border-current/30 p-1.5" aria-hidden="true"><span className={QR} />{LINES}</span>,
  'qr-top': <span className="flex h-9 w-14 flex-col items-center gap-1 rounded-sm border border-current/30 p-1" aria-hidden="true"><span className="h-4 w-4 rounded-[2px] bg-current" /><span className="h-1 w-8 rounded-full bg-current opacity-60" /></span>,
  'text-only': <span className="flex h-9 w-14 items-center rounded-sm border border-current/30 p-1.5" aria-hidden="true">{LINES}</span>,
}

const LAYOUT_CARDS = LAYOUT_OPTIONS.map((o) => ({ ...o, preview: LAYOUT_PREVIEWS[o.value] }))
const SIZE_CARDS = SIZE_PRESETS.map((p) => ({ value: p.value, label: p.label }))

// Ordered field list: enabled fields first (in print order), then the rest.
function FieldList({ fields, onChange, disabled }) {
  const ordered = [
    ...fields.map((key) => FIELD_OPTIONS.find((f) => f.value === key)).filter(Boolean),
    ...FIELD_OPTIONS.filter((f) => !fields.includes(f.value)),
  ]
  return (
    <ul className="divide-y divide-[hsl(var(--border)/0.6)] rounded-md border border-[hsl(var(--border))]" aria-label="Campos impresos">
      {ordered.map((field) => {
        const index = fields.indexOf(field.value)
        const on = index >= 0
        return (
          <li key={field.value} className="flex items-center gap-2 px-3 py-1.5">
            <CheckboxField className="min-w-0 flex-1" label={field.label} checked={on} disabled={disabled}
              onChange={() => onChange(toggleField(fields, field.value))} />
            {on ? (
              <span className="flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled || index === 0}
                  aria-label={`Subir ${field.label}`} onClick={() => onChange(moveField(fields, field.value, -1))}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled || index === fields.length - 1}
                  aria-label={`Bajar ${field.label}`} onClick={() => onChange(moveField(fields, field.value, 1))}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function Group({ title, children, hint }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{title}</h3>
      {children}
      {hint ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p> : null}
    </section>
  )
}

// Editable label design (size, distribution, fields, QR). draft is local
// state of the screen; nothing is saved until "Guardar".
export function LabelTemplateEditor({ draft, onChange, disabled }) {
  const sizePreset = presetFor(draft.widthMm, draft.heightMm)
  const [customSize, setCustomSize] = useState(sizePreset === 'custom')
  const preset = customSize ? 'custom' : sizePreset
  const set = (patch) => onChange({ ...draft, ...patch })
  const setQr = (patch) => onChange({ ...draft, qrOptions: { ...draft.qrOptions, ...patch } })

  return (
    <div className="space-y-5">
      <Group title="Tamaño">
        <ChoiceCardGroup columns={4} size="sm" ariaLabel="Tamaño de la etiqueta" options={SIZE_CARDS} value={preset} disabled={disabled}
          onChange={(value) => {
            const p = SIZE_PRESETS.find((s) => s.value === value)
            setCustomSize(!p?.widthMm)
            if (p?.widthMm) set({ widthMm: p.widthMm, heightMm: p.heightMm })
          }} />
        {preset === 'custom' ? (
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Ancho (mm)" min={10} max={300} allowNegative={false} value={draft.widthMm} disabled={disabled}
              onChange={(e) => set({ widthMm: e.target.value })} />
            <NumberField label="Alto (mm)" min={10} max={300} allowNegative={false} value={draft.heightMm} disabled={disabled}
              onChange={(e) => set({ heightMm: e.target.value })} />
          </div>
        ) : null}
        <SelectField label="Resolución" options={DPI_OPTIONS} value={String(draft.dpi)} disabled={disabled}
          onValueChange={(v) => set({ dpi: Number(v) })} />
      </Group>

      <Group title="Distribución">
        <ChoiceCardGroup columns={3} ariaLabel="Distribución" options={LAYOUT_CARDS} value={draft.layout} disabled={disabled}
          onChange={(layout) => set({ layout })} />
      </Group>

      <Group title="Campos" hint="Se imprimen en este orden; el primero va destacado.">
        <FieldList fields={draft.fields} disabled={disabled} onChange={(fields) => set({ fields })} />
      </Group>

      {draft.layout !== 'text-only' ? (
        <Group title="Código QR">
          <SelectField label="Contenido" options={CONTENT_MODE_OPTIONS} value={draft.qrOptions.contentMode} disabled={disabled}
            onValueChange={(contentMode) => setQr({ contentMode })} />
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Corrección de errores" options={ERROR_CORRECTION_OPTIONS} value={draft.qrOptions.errorCorrection} disabled={disabled}
              onValueChange={(errorCorrection) => setQr({ errorCorrection })} />
            <NumberField label="Margen (mm)" min={0} max={10} allowNegative={false} value={draft.qrOptions.quietZoneMm} disabled={disabled}
              onChange={(e) => setQr({ quietZoneMm: e.target.value })} />
          </div>
        </Group>
      ) : null}
    </div>
  )
}
