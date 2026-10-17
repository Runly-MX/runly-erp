import { NumberField, SwitchField } from '@runly/ui'

const INT = { allowNegative: false, allowDecimal: false }

// Assignment settings on the lesson editor page (the instructions are the lesson body).
export function AssignmentSettingsFields({ value, onChange, errors = {}, disabled = false }) {
  const field = (key) => (event) => onChange(key, event.target.value)
  return (
    <section className="space-y-4 border-t border-[hsl(var(--border))] pt-4" aria-labelledby="lms-assignment-settings">
      <h3 id="lms-assignment-settings" className="text-sm font-semibold">Configuración de la tarea</h3>
      <SwitchField
        id="lms-assignment-text" label="Respuesta escrita" description="El alumno puede escribir su entrega."
        checked={value.allowText} onChange={(checked) => onChange('allowText', checked)} disabled={disabled} error={errors.allowText}
      />
      <SwitchField
        id="lms-assignment-files" label="Archivos adjuntos" description="PDF, imágenes, documentos de Office, audio, video o ZIP, hasta 50 MB cada uno."
        checked={value.allowFiles} onChange={(checked) => onChange('allowFiles', checked)} disabled={disabled}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {value.allowFiles ? (
          <NumberField label="Máximo de archivos" required value={value.maxFiles} onChange={field('maxFiles')} error={errors.maxFiles} hint="De 1 a 10." {...INT} disabled={disabled} />
        ) : null}
        <NumberField
          label="Días para entregar" value={value.dueDaysAfterEnroll} onChange={field('dueDaysAfterEnroll')} error={errors.dueDaysAfterEnroll}
          hint="Desde la inscripción. Vacío: sin fecha límite. Las entregas tardías se aceptan y se marcan." {...INT} disabled={disabled}
        />
      </div>
      <NumberField
        label="Calificación mínima (opcional)" value={value.passingScore} onChange={field('passingScore')} error={errors.passingScore}
        hint="Con un valor, se califica de 0 a 100 y aprobar exige al menos esa calificación. Vacío: solo aprobar o devolver." {...INT} disabled={disabled}
      />
    </section>
  )
}
