import { Button, Checkbox, ChoiceCardGroup, NumberField, SwitchField, cn } from '@runly/ui'
import { Circle, CircleCheck } from 'lucide-react'
import { parseBlanks, setOptionCorrect } from '../../lib/lmsQuestionForm.js'
import { RowListEditor } from './RowListEditor.jsx'

const TRUE_FALSE = [{ value: 'true', label: 'Verdadero' }, { value: 'false', label: 'Falso' }]
const NUMBER_LIMIT = 1_000_000_000

function CorrectRadio({ checked, onSelect, index, disabled }) {
  const Icon = checked ? CircleCheck : Circle
  return (
    <Button
      type="button" variant="ghost" size="sm" role="radio" aria-checked={checked} disabled={disabled}
      aria-label={`Marcar la opción ${index + 1} como correcta`} onClick={onSelect}
      className={cn('shrink-0 gap-1.5 px-2', checked ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300' : 'text-[hsl(var(--muted-foreground))]')}
    >
      <Icon aria-hidden="true" /><span className="hidden sm:inline">Correcta</span>
    </Button>
  )
}

function CorrectCheck({ checked, onChange, index, disabled }) {
  return (
    <label className={cn('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs', checked ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'text-[hsl(var(--muted-foreground))]')}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} aria-label={`La opción ${index + 1} es correcta`} />
      <span className="hidden sm:inline">Correcta</span>
    </label>
  )
}

const Switch = ({ id, label, description, checked, onChange, disabled }) => (
  <SwitchField id={id} label={label} description={description} checked={checked} onChange={onChange} disabled={disabled} />
)

function ChoiceFields({ form, onChange, errors, disabled }) {
  const single = form.kind === 'single'
  const marker = (row, index) => (single
    ? <CorrectRadio checked={row.correct} index={index} disabled={disabled} onSelect={() => onChange(setOptionCorrect(form, index, true))} />
    : <CorrectCheck checked={row.correct} index={index} disabled={disabled} onChange={(checked) => onChange(setOptionCorrect(form, index, checked))} />)
  return (
    <>
      <div role={single ? 'radiogroup' : undefined} aria-label={single ? 'Respuesta correcta' : undefined}>
        <RowListEditor
          form={form} field="options" onChange={onChange} error={errors.options} disabled={disabled} marker={marker}
          label="Opciones" addLabel="Agregar opción" placeholder={(i) => `Opción ${i + 1}`}
          hint={single ? 'Marca la respuesta correcta. Enter agrega otra opción.' : 'Marca todas las respuestas correctas. Enter agrega otra opción.'}
        />
      </div>
      {!single ? (
        <Switch
          id="lms-q-partial" label="Puntos parciales" checked={form.partialCredit} disabled={disabled}
          onChange={(value) => onChange({ ...form, partialCredit: value })}
          description="Cada acierto suma y cada opción incorrecta marcada resta; nunca baja de 0. Si está apagado, solo suma si marca exactamente las correctas."
        />
      ) : null}
    </>
  )
}

function FillBlankHelp({ form }) {
  const blanks = parseBlanks(form.prompt)
  return (
    <div className="space-y-2 rounded-md bg-[hsl(var(--muted)/0.6)] p-3 text-sm">
      <p>
        Escribe la respuesta de cada espacio entre dobles corchetes dentro de la pregunta. Para aceptar varias respuestas, sepáralas con <code>|</code>.
      </p>
      <p className="text-[hsl(var(--muted-foreground))]">Ejemplo: La capital de Francia es [[París]] y su río es el [[Sena|río Sena]].</p>
      {blanks.length ? (
        <ol className="list-decimal space-y-0.5 pl-5 text-[hsl(var(--muted-foreground))]">
          {blanks.map((answers, index) => <li key={index}>{answers.length ? answers.join(' · ') : <span className="text-[hsl(var(--destructive))]">Sin respuesta</span>}</li>)}
        </ol>
      ) : <p className="font-medium">Todavía no hay espacios en blanco.</p>}
    </div>
  )
}

// The part of the question form that depends on the type.
export function KindFields({ form, onChange, errors = {}, disabled = false }) {
  const set = (patch) => onChange({ ...form, ...patch })
  switch (form.kind) {
    case 'single':
    case 'multiple':
      return <ChoiceFields form={form} onChange={onChange} errors={errors} disabled={disabled} />
    case 'true_false':
      return (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Respuesta correcta</p>
          <ChoiceCardGroup columns={2} size="sm" options={TRUE_FALSE} value={form.trueFalse} onChange={(value) => set({ trueFalse: value })} disabled={disabled} ariaLabel="Respuesta correcta" />
        </div>
      )
    case 'short':
      return (
        <>
          <RowListEditor
            form={form} field="accepted" onChange={onChange} error={errors.accepted} disabled={disabled} sortable={false}
            label="Respuestas aceptadas" addLabel="Agregar respuesta" placeholder={(i) => `Respuesta ${i + 1}`}
            hint="Cualquiera de estas cuenta como correcta. No importan mayúsculas, acentos ni espacios al inicio o al final."
          />
          <Switch
            id="lms-q-exact" label="Coincidencia exacta" checked={form.exactMatch} disabled={disabled} onChange={(value) => set({ exactMatch: value })}
            description="Distingue mayúsculas y acentos (solo ignora espacios al inicio o al final)."
          />
        </>
      )
    case 'numeric':
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Respuesta correcta" required value={form.numericAnswer} onChange={(event) => set({ numericAnswer: event.target.value })}
            error={errors.numericAnswer} min={-NUMBER_LIMIT} max={NUMBER_LIMIT} disabled={disabled} hint="Admite decimales y negativos."
          />
          <NumberField
            label="Margen de error (±)" value={form.tolerance} onChange={(event) => set({ tolerance: event.target.value })}
            error={errors.tolerance} min={0} max={NUMBER_LIMIT} allowNegative={false} disabled={disabled}
            hint="Opcional. Con 0.5 y respuesta 10, se acepta de 9.5 a 10.5."
          />
        </div>
      )
    case 'fill_blank':
      return (
        <>
          <FillBlankHelp form={form} />
          <Switch
            id="lms-q-all" label="Todo o nada" checked={form.allOrNothing} disabled={disabled} onChange={(value) => set({ allOrNothing: value })}
            description="Solo suma puntos si completa bien todos los espacios. Si está apagado, cada espacio correcto suma su parte."
          />
          <Switch
            id="lms-q-exact" label="Coincidencia exacta" checked={form.exactMatch} disabled={disabled} onChange={(value) => set({ exactMatch: value })}
            description="Distingue mayúsculas y acentos."
          />
        </>
      )
    case 'ordering':
      return (
        <>
          <RowListEditor
            form={form} field="items" onChange={onChange} error={errors.items} disabled={disabled}
            label="Elementos en el orden correcto" addLabel="Agregar elemento" placeholder={(i) => `Elemento ${i + 1}`}
            hint="Escríbelos de arriba hacia abajo en el orden correcto. El alumno los verá mezclados."
          />
          <Switch
            id="lms-q-partial" label="Puntos parciales" checked={form.partialCredit} disabled={disabled} onChange={(value) => set({ partialCredit: value })}
            description="Suma según cuántos elementos quedan en su lugar. Si está apagado, solo suma si todo el orden es correcto."
          />
        </>
      )
    case 'matching':
      return (
        <>
          <RowListEditor
            form={form} field="pairs" onChange={onChange} error={errors.pairs} disabled={disabled}
            label="Parejas" addLabel="Agregar pareja" placeholder={(i) => `Pareja ${i + 1}`}
            hint="Escribe cada elemento con su pareja correcta. El alumno verá la columna derecha mezclada."
          />
          <Switch
            id="lms-q-partial" label="Puntos parciales" checked={form.partialCredit} disabled={disabled} onChange={(value) => set({ partialCredit: value })}
            description="Suma según cuántas parejas une bien. Si está apagado, solo suma si todas son correctas."
          />
        </>
      )
    default:
      return (
        <p className="rounded-md bg-[hsl(var(--muted)/0.6)] p-3 text-sm text-[hsl(var(--muted-foreground))]">
          El alumno escribe su respuesta y un instructor la califica desde Revisión, de 0 a {form.points || 1} puntos.
        </p>
      )
  }
}
