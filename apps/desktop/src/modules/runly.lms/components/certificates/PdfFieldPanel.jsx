import { useState } from 'react'
import { Button, CheckboxField, NumberField, SelectField, TextField, cn } from '@runly/ui'
import { Plus, Trash2 } from 'lucide-react'
import { ALIGN_OPTIONS, CUSTOM_FIELD_RE, FIELD_KEYS, MIN_FIELD, clampField, customFieldKey, fieldLabel, isImageField } from '../../lib/certLayout.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const HEX = /^#[0-9a-f]{6}$/i

// Bounded to the page in points: out-of-range values are clamped on blur.
function NumberInput({ label, value, onCommit, min = 0, max, step = 1 }) {
  return (
    <NumberField
      label={label} min={min} max={max} step={step} icon={null}
      value={Number.isFinite(value) ? String(Math.round(value * 10) / 10) : ''}
      onChange={(event) => { const next = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(next)) onCommit(next) }}
    />
  )
}

function FieldProperties({ field, page, onChange }) {
  const set = (patch) => onChange(clampField({ ...field, ...patch }, page))
  const text = !isImageField(field.key)
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{fieldLabel(field.key)}</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="X (pt)" value={field.x} max={Math.max(0, page.width - field.w)} onCommit={(x) => set({ x })} />
        <NumberInput label="Y (pt)" value={field.y} max={Math.max(0, page.height - field.h)} onCommit={(y) => set({ y })} />
        <NumberInput label="Ancho" value={field.w} min={MIN_FIELD} max={page.width} onCommit={(w) => set({ w })} />
        <NumberInput label="Alto" value={field.h} min={MIN_FIELD} max={page.height} onCommit={(h) => set({ h })} />
      </div>
      {text ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Tamaño (pt)" value={field.fontSize} min={4} max={144} step={0.5} onCommit={(fontSize) => set({ fontSize: Math.min(144, Math.max(4, fontSize)) })} />
            <SelectField label="Alineación" options={ALIGN_OPTIONS} value={field.align} onValueChange={(align) => set({ align })} />
          </div>
          <div className="flex items-end gap-2">
            <TextField
              label="Color" icon={null} maxLength={7} value={field.color ?? ''} placeholder="#111827" className="font-mono"
              error={field.color && !HEX.test(field.color) ? 'Usa un color como #111827.' : undefined}
              onChange={(event) => onChange({ ...field, color: event.target.value.trim() })}
            />
            <span className="mb-1 h-8 w-8 shrink-0 rounded-md border border-[hsl(var(--border))]" style={{ backgroundColor: HEX.test(field.color ?? '') ? field.color : 'transparent' }} aria-hidden="true" />
          </div>
          <CheckboxField label="Negritas" checked={Boolean(field.bold)} onChange={(event) => set({ bold: event.target.checked })} />
          <CheckboxField
            label="Fondo blanco" hint="Cubre el texto de ejemplo que ya trae el PDF."
            checked={Boolean(field.background)} onChange={(event) => set({ background: event.target.checked ? '#ffffff' : null })}
          />
          <p className={MUTED}>Si el texto no cabe en el ancho, se reduce automáticamente.</p>
        </>
      ) : (
        <p className={MUTED}>La imagen se ajusta dentro del recuadro sin deformarse.{field.key === 'qr' ? ' Lleva a la página pública de verificación.' : ''}</p>
      )}
    </div>
  )
}

// "Campo del formulario": a custom intake answer of share-link guests (campo_<clave>).
function CustomFieldAdder({ onAdd, taken }) {
  const [text, setText] = useState('')
  const key = customFieldKey(text)
  const add = () => { if (key && !taken.has(key)) { onAdd(key); setText('') } }
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <TextField
          label="Campo del formulario de invitados" icon={null} placeholder="planta" value={text} maxLength={30}
          hint={key ? `Se imprime la respuesta de {{${key}}}.` : 'La clave se ve en Compartir > Formulario.'}
          error={key && taken.has(key) ? 'Ese campo ya está en la página.' : undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }}
        />
      </div>
      <Button type="button" variant="outline" size="icon" aria-label="Agregar campo del formulario" disabled={!key || taken.has(key)} onClick={add}><Plus /></Button>
    </div>
  )
}

// Side panel: which fields are placed (fixed ones plus campo_<clave>), and the selected one's properties.
export function PdfFieldPanel({ page, fields, selectedKey, onSelect, onAdd, onRemove, onChange }) {
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const selected = byKey.get(selectedKey) ?? null
  const keys = [...FIELD_KEYS, ...fields.map((f) => f.key).filter((key) => CUSTOM_FIELD_RE.test(key))]
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Campos</p>
        <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
          {keys.map((key) => {
            const placed = byKey.has(key)
            return (
              <li key={key} className={cn('flex items-center gap-1 pr-1', key === selectedKey && 'bg-[hsl(var(--muted))]')}>
                <button
                  type="button" disabled={!placed} onClick={() => onSelect(key)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm disabled:cursor-default"
                >
                  <span className={cn('truncate', !placed && 'text-[hsl(var(--muted-foreground))]')}>{fieldLabel(key)}</span>
                  {isImageField(key) ? <span className={MUTED}>Imagen</span> : null}
                </button>
                {placed ? (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${fieldLabel(key)}`} onClick={() => onRemove(key)}><Trash2 /></Button>
                ) : (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Agregar ${fieldLabel(key)}`} onClick={() => onAdd(key)}><Plus /></Button>
                )}
              </li>
            )
          })}
        </ul>
        <CustomFieldAdder onAdd={onAdd} taken={new Set(byKey.keys())} />
      </div>
      {selected ? (
        <div className="rounded-md border border-[hsl(var(--border))] p-3">
          <FieldProperties field={selected} page={page} onChange={onChange} />
        </div>
      ) : (
        <p className={MUTED}>Selecciona un campo en la página para moverlo, cambiar su tamaño o su estilo. Usa las flechas para ajustarlo (Mayús + flecha: 10 puntos).</p>
      )}
    </div>
  )
}
