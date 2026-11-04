import { Button, NumberField, PasswordField, Skeleton, StatusPill, SwitchField, TextField } from '@runly/ui'
import { CheckCircle2, Info, Lock, Mail, Send, Server, User } from 'lucide-react'
import { SettingsCard } from './SettingsCard.jsx'

// Website SMTP form (presentation only): state and mutations stay in WebsiteSettingsScreen.
export function SettingsSmtpCard({ form, setForm, configured, loading, passChanged, onPassChange, onTlsChange, onDirty, onSubmit, saving, onTest, testing }) {
  const port = Number(form.port)
  const startTls = [25, 587].includes(port)
  return (
    <SettingsCard
      icon={Mail}
      tone="emerald"
      title="Correo electrónico (SMTP)"
      description="Credenciales compartidas por todos los sitios de la empresa. Si no se configuran, se usa el SMTP de la empresa como respaldo."
      status={configured
        ? <StatusPill tone="success" icon={CheckCircle2}>Configurado</StatusPill>
        : <StatusPill tone="neutral" icon={Info}>Usa el de la empresa</StatusPill>}
    >
      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-11 rounded-lg" /><Skeleton className="h-11 rounded-lg" /></div>
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ) : (
        <form onChangeCapture={onDirty} onSubmit={onSubmit} className="space-y-5">
          <fieldset className="space-y-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Servidor</legend>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <TextField label="Servidor (host)" icon={Server} placeholder="smtp.gmail.com" value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} required />
              <NumberField label="Puerto" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))} required />
            </div>
            <TextField label="Usuario" icon={User} placeholder="reservas@minegocio.com" value={form.user} onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))} required />
            <PasswordField
              label={configured && !passChanged ? 'Contraseña (déjala en blanco para mantenerla)' : 'Contraseña'}
              placeholder={configured ? '••••••••' : ''}
              value={form.pass}
              onChange={(e) => onPassChange(e.target.value)}
            />
          </fieldset>

          <fieldset className="space-y-4 border-t border-[hsl(var(--border))] pt-5">
            <legend className="sr-only">Remitente</legend>
            <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Remitente</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Nombre del remitente" icon={Mail} placeholder="Mi Restaurante" value={form.from_name} onChange={(e) => setForm((f) => ({ ...f, from_name: e.target.value }))} />
              <TextField label="Email del remitente" icon={Mail} placeholder="reservas@minegocio.com" value={form.from_email} onChange={(e) => setForm((f) => ({ ...f, from_email: e.target.value }))} />
            </div>
          </fieldset>

          <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3">
            <SwitchField
              id="ws-smtp-tls"
              label={startTls ? 'Exigir STARTTLS' : 'Usar TLS directo (SSL)'}
              checked={port === 465 || form.tls}
              disabled={port === 465}
              onChange={onTlsChange}
            />
            <p className="flex gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {startTls
                ? 'La conexión se cifra mediante STARTTLS. Activa esta opción para exigirlo; desactivada, se usa si el servidor lo ofrece.'
                : 'El puerto 465 siempre usa TLS directo. Para STARTTLS usa el puerto 587, según las indicaciones de tu proveedor.'}
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[hsl(var(--border))] pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onTest} disabled={testing}>
              <Send className="mr-1.5 h-4 w-4" aria-hidden />{testing ? 'Enviando...' : 'Enviar prueba'}
            </Button>
            <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar configuración'}</Button>
          </div>
        </form>
      )}
    </SettingsCard>
  )
}
