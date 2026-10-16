import { Button, NumberStepper, SortableList, Switch, SwitchField, cn } from '@runly/ui'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { FIELD_OPTIONS, FONT_MM, FONT_SIZE_MODES, moveField, toggleField } from '../../lib/label-layout.js'
import { FieldHint, SegmentTabs } from './studio-ui.jsx'

const MAX_FIELDS = 6

// Printed fields as a reorderable list: drag handle (pointer or keyboard) plus
// up/down buttons, a switch per field, field names and text size.
export function LabelContentSection({ draft, onChange, disabled }) {
  const fields = draft.fields
  const set = (patch) => onChange({ ...draft, ...patch })
  const setText = (patch) => onChange({ ...draft, textOptions: { ...draft.textOptions, ...patch } })
  const enabled = fields.map((key) => FIELD_OPTIONS.find((f) => f.value === key)).filter(Boolean).map((f) => ({ ...f, id: f.value }))
  const available = FIELD_OPTIONS.filter((f) => !fields.includes(f.value))
  const full = fields.length >= MAX_FIELDS
  const fixedFont = draft.textOptions?.fontMm != null && draft.textOptions.fontMm !== ''

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium" id="label-fields-title">Campos impresos</p>
        {enabled.length ? (
          <div role="list" aria-labelledby="label-fields-title" className="overflow-hidden rounded-md border border-[hsl(var(--border))] [&>div:last-child>div]:border-b-0">
            <SortableList items={enabled} onReorder={(next) => set({ fields: next.map((f) => f.value) })}
              renderItem={(field, { dragHandleProps, isDragging }) => {
                const index = fields.indexOf(field.value)
                return (
                  <div role="listitem" className={cn('flex min-h-12 items-center gap-1 border-b border-[hsl(var(--border)/0.6)] bg-[hsl(var(--card))] pl-1 pr-2', isDragging && 'relative z-10 shadow-md')}>
                    <button type="button" {...dragHandleProps} disabled={disabled} aria-label={`Mover ${field.label}`}
                      className="flex h-11 w-8 shrink-0 cursor-grab items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] active:cursor-grabbing">
                      <GripVertical className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="w-5 shrink-0 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{index + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{field.label}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" disabled={disabled || index === 0}
                      aria-label={`Subir ${field.label}`} onClick={() => set({ fields: moveField(fields, field.value, -1) })}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" disabled={disabled || index === fields.length - 1}
                      aria-label={`Bajar ${field.label}`} onClick={() => set({ fields: moveField(fields, field.value, 1) })}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Switch checked aria-label={`Imprimir ${field.label}`} disabled={disabled}
                      onCheckedChange={() => set({ fields: toggleField(fields, field.value) })} />
                  </div>
                )
              }} />
          </div>
        ) : (
          <FieldHint tone={draft.layout === 'text-only' ? 'error' : 'muted'}>
            {draft.layout === 'text-only' ? 'Activa al menos un campo.' : 'Sin texto: solo se imprime el código.'}
          </FieldHint>
        )}
        {available.length ? (
          <div>
            <p className="mb-1.5 text-xs text-[hsl(var(--muted-foreground))]">{full ? `Máximo ${MAX_FIELDS} campos para que la etiqueta sea legible.` : 'Agregar campo'}</p>
            <div className="flex flex-wrap gap-2">
              {available.map((field) => (
                <Button key={field.value} type="button" variant="outline" size="sm" className="h-9" disabled={disabled || full}
                  onClick={() => set({ fields: toggleField(fields, field.value) })}>
                  + {field.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <FieldHint>Todos los campos usan el mismo tamaño; los valores largos pasan a la siguiente línea. Arrastra o usa las flechas para cambiar el orden.</FieldHint>
      </div>

      <SwitchField label="Mostrar nombre del campo" description="Imprime «Serie: ABC123» en lugar de «S/N ABC123»."
        checked={Boolean(draft.textOptions?.showFieldNames)} disabled={disabled || !fields.length}
        onChange={(v) => setText({ showFieldNames: Boolean(v) })} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Tamaño del texto</p>
        <SegmentTabs ariaLabel="Tamaño del texto" options={FONT_SIZE_MODES} value={fixedFont ? 'custom' : 'auto'} size="touch"
          disabled={disabled || !fields.length}
          onChange={(mode) => setText({ fontMm: mode === 'custom' ? FONT_MM.initial : null })} />
        {fixedFont ? (
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm">Texto (mm)</span>
            <NumberStepper label="Texto (mm)" value={Number(draft.textOptions.fontMm)} min={FONT_MM.min} max={FONT_MM.max}
              step={FONT_MM.step} precision={2} disabled={disabled || !fields.length} onChange={(v) => setText({ fontMm: v })} />
          </div>
        ) : null}
        <FieldHint>
          {fixedFont ? 'Si el texto no cabe a este tamaño, se reduce lo necesario.' : 'Se ajusta a la etiqueta y a la cantidad de campos.'}
        </FieldHint>
      </div>
    </div>
  )
}
