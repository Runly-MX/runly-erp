import { Button, ChoiceCardGroup, PasswordField, StatusPill, TextField } from '@runly/ui'
import { BarChart3, CheckCircle2, EyeOff, Info, ShieldCheck, UserCheck } from 'lucide-react'
import { SettingsCard } from './SettingsCard.jsx'

const MODE_META = {
  off: { icon: EyeOff, description: 'No se envían eventos.' },
  anonymous: { icon: BarChart3, description: 'Sin banner de consentimiento.' },
  consent_required: { icon: UserCheck, description: 'Solo tras la autorización del visitante.' },
}

// Analytics mode + Cloudflare Turnstile keys (presentation only; state lives in WebsiteSettingsScreen).
export function SettingsAnalyticsCard({ form, setForm, modeOptions, secretSet, secretChanged, onSecretChange, onSubmit, saving }) {
  const options = modeOptions.map((option) => ({ ...option, ...MODE_META[option.value] }))
  return (
    <SettingsCard
      icon={BarChart3}
      tone="violet"
      title="Analítica y protección de formularios"
      description="Controla la medición de visitas y las claves de Cloudflare Turnstile contra el spam."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">Modo de analítica</legend>
          <ChoiceCardGroup
            ariaLabel="Modo de analítica"
            className="max-sm:grid-cols-1"
            options={options}
            value={form.analyticsMode}
            onChange={(value) => setForm((current) => ({ ...current, analyticsMode: value }))}
          />
          <p className="flex gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Runly respeta siempre Do Not Track. El modo con consentimiento no envía eventos hasta que el visitante lo autoriza.
          </p>
        </fieldset>

        <fieldset className="space-y-4 border-t border-[hsl(var(--border))] pt-5">
          <legend className="sr-only">Turnstile</legend>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />Cloudflare Turnstile</p>
            {secretSet
              ? <StatusPill tone="success" icon={CheckCircle2} size="sm">Clave secreta guardada</StatusPill>
              : <StatusPill tone="neutral" icon={Info} size="sm">Sin clave secreta</StatusPill>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Turnstile Site Key"
              value={form.turnstileSiteKey}
              onChange={(event) => setForm((current) => ({ ...current, turnstileSiteKey: event.target.value }))}
              placeholder="Clave pública"
            />
            <PasswordField
              label={secretSet && !secretChanged ? 'Turnstile Secret Key (déjala en blanco para mantenerla)' : 'Turnstile Secret Key'}
              value={form.turnstileSecretKey}
              onChange={(event) => onSecretChange(event.target.value)}
              placeholder={secretSet ? '••••••••' : 'Clave secreta'}
            />
          </div>
        </fieldset>

        <div className="flex justify-end border-t border-[hsl(var(--border))] pt-4">
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? 'Guardando...' : 'Guardar analítica'}</Button>
        </div>
      </form>
    </SettingsCard>
  )
}
