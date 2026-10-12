import { Hourglass } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, SelectField, SwitchField } from '@runly/ui'
import { useSaveSettings, useSettings } from '../hooks/useAttendanceData.js'
import { TimezoneField } from './fields/TimezoneField.jsx'

// 6 h .. 12 h in 30-minute steps (stored in minutes).
const THRESHOLD_OPTIONS = Array.from({ length: 13 }, (_, i) => {
  const minutes = 360 + i * 30
  const h = Math.floor(minutes / 60)
  return { value: String(minutes), label: minutes % 60 ? `${h} h 30 min` : `${h} horas` }
})
const ROUNDING_OPTIONS = [
  { value: '0', label: 'No redondear' },
  ...[5, 10, 15, 30, 60].map((m) => ({ value: String(m), label: `${m} minutos` })),
]

// "General" tab card: time zone, daily workday and overtime rules. Saves on every change.
export function OvertimeSettings({ canConfigure }) {
  const { data: settings } = useSettings()
  const save = useSaveSettings()
  const disabled = !canConfigure || !settings || save.isPending
  const threshold = Number(settings?.dailyThresholdMinutes ?? 480)
  const thresholdOptions = THRESHOLD_OPTIONS.some((o) => o.value === String(threshold))
    ? THRESHOLD_OPTIONS
    : [...THRESHOLD_OPTIONS, { value: String(threshold), label: `${Math.floor(threshold / 60)} h ${threshold % 60} min` }].sort((a, b) => Number(a.value) - Number(b.value))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Hourglass className="h-5 w-5 text-teal-600" /> Horas extra y jornada</CardTitle>
        <CardDescription>
          Las horas extra son las que trabaja una persona más allá de lo que marca su turno ese día. En domingo o en un día de
          descanso todo lo trabajado cuenta como extra. Asistencia solo muestra horas; no calcula pagos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <TimezoneFieldWrapper settings={settings} disabled={disabled} onSave={(timezone) => save.mutate({ timezone })} />
        <SelectField
          label="Jornada diaria para personas sin turno"
          options={thresholdOptions}
          value={settings ? String(threshold) : ''}
          onValueChange={(value) => save.mutate({ dailyThresholdMinutes: Number(value) })}
          disabled={disabled}
          hint="Quien no tiene un turno asignado genera horas extra después de esta cantidad de horas en el día."
        />
        <SelectField
          label="Redondear horas extra hacia abajo"
          options={ROUNDING_OPTIONS}
          value={settings ? String(settings.overtimeRoundingMinutes ?? 0) : ''}
          onValueChange={(value) => save.mutate({ overtimeRoundingMinutes: Number(value) })}
          disabled={disabled}
          hint="Con 15 minutos, 1 h 50 min de extra cuenta como 1 h 45 min."
        />
        <SwitchField
          id="attendance-require-overtime-approval"
          label="Las horas extra requieren aprobación"
          description="Hasta que alguien las apruebe no cuentan en el reporte."
          checked={Boolean(settings?.requireOvertimeApproval)}
          onChange={(checked) => save.mutate({ requireOvertimeApproval: checked })}
          disabled={disabled}
        />
        <SwitchField
          id="attendance-allow-corrections"
          label="Permitir que las personas soliciten checadas olvidadas desde su teléfono"
          description="Las solicitudes llegan a la pantalla Solicitudes, donde las apruebas o rechazas. Al aprobar se crea la checada."
          checked={settings?.allowCorrections !== false}
          onChange={(checked) => save.mutate({ allowCorrections: checked })}
          disabled={disabled}
        />
      </CardContent>
    </Card>
  )
}

function TimezoneFieldWrapper({ settings, disabled, onSave }) {
  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : undefined} aria-disabled={disabled}>
      <TimezoneField label="Zona horaria de la empresa" value={settings?.timezone ?? ''} onChange={(tz) => tz && tz !== settings?.timezone && onSave(tz)} />
      <p className="pt-1.5 text-xs text-[hsl(var(--muted-foreground))]">Define dónde empieza y termina cada día para calcular horas, retardos y extras.</p>
    </div>
  )
}
