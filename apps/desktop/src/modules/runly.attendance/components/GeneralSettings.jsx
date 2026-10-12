import { Camera } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, SelectField, SwitchField } from '@runly/ui'
import { useSaveSettings, useSettings } from '../hooks/useAttendanceData.js'

const DEFAULT_CHOICES = [7, 15, 30, 60, 90, 180, 365]

// "General" tab of the setup screen: evidence retention and photo policy.
export function GeneralSettings({ canConfigure }) {
  const { data: settings } = useSettings()
  const save = useSaveSettings()
  const choices = settings?.retentionChoices ?? DEFAULT_CHOICES
  const options = choices.map((days) => ({ value: String(days), label: `${days} días` }))
  const disabled = !canConfigure || !settings || save.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5 text-teal-600" /> Evidencia y privacidad</CardTitle>
        <CardDescription>Qué evidencia guardan las checadas y por cuánto tiempo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SelectField
          label="Conservar fotos y ubicaciones"
          options={options}
          value={settings ? String(settings.evidenceRetentionDays) : ''}
          onValueChange={(value) => save.mutate({ evidenceRetentionDays: Number(value) })}
          disabled={disabled}
          hint="Pasado este tiempo las fotos y las coordenadas de las checadas se eliminan solas. Las horas y el historial de checadas se conservan. Las fotos no aparecen en el módulo de Archivos."
        />
        <SwitchField
          id="attendance-require-photo"
          label="Exigir foto en checadas con tarjeta o QR"
          description="Evita que alguien más cheque por ti: si no hay foto, la checada se marca para revisión. Escanear el kiosko con el teléfono es la opción más segura y también toma foto."
          checked={Boolean(settings?.requirePhotoForQr)}
          onChange={(checked) => save.mutate({ requirePhotoForQr: checked })}
          disabled={disabled}
        />
      </CardContent>
    </Card>
  )
}
