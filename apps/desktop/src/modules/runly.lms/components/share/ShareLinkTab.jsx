import { useState } from 'react'
import { Alert, AlertDescription, Button, CheckboxField, Input, RadioGroupField, SwitchField } from '@runly/ui'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { ACCESS_MODE_OPTIONS } from '../../lib/lmsIntake.js'
import { SCOPE_OPTIONS, absoluteShareUrl, guestCapabilities } from '../../lib/lmsShare.js'

function Rules({ settings }) {
  const { can, cannot } = guestCapabilities(settings)
  return (
    <div className="grid gap-3 rounded-md bg-[hsl(var(--muted)/0.6)] p-3 text-sm sm:grid-cols-2">
      <div>
        <p className="mb-1 font-medium">Los invitados pueden</p>
        <ul className="list-disc space-y-0.5 pl-4 text-[hsl(var(--muted-foreground))]">{can.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <div>
        <p className="mb-1 font-medium">No tienen</p>
        <ul className="list-disc space-y-0.5 pl-4 text-[hsl(var(--muted-foreground))]">{cannot.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
    </div>
  )
}

// "Enlace" tab of the share dialog: on/off, access mode, scope, quizzes,
// assignments, certificates and the link itself. Every change saves at once.
export function ShareLinkTab({ data, busy, onSave }) {
  const [copied, setCopied] = useState(false)
  const settings = data.settings
  const invite = settings.accessMode === 'invite'
  const url = absoluteShareUrl(data)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error('No se pudo copiar. Selecciona el enlace y cópialo a mano.') }
  }

  return (
    <div className="space-y-5">
      <SwitchField
        label="Enlace público activo" description="Desactívalo para que el enlace deje de funcionar al instante."
        checked={data.enabled} onChange={(enabled) => onSave({ enabled })} disabled={busy}
      />
      {data.enabled && !data.published ? (
        <Alert><AlertDescription>El curso no está publicado: el enlace funcionará cuando lo publiques.</AlertDescription></Alert>
      ) : null}
      <RadioGroupField
        label="Quién puede entrar" name="lms-share-access" options={ACCESS_MODE_OPTIONS} value={settings.accessMode}
        onChange={(accessMode) => { if (!busy) onSave({ accessMode }) }}
        hint={invite
          ? 'Invita a cada persona en la pestaña Invitaciones. Al entrar en otro dispositivo se cierra la sesión anterior.'
          : 'Los invitados escriben su nombre y los datos de la pestaña Formulario.'}
      />
      <RadioGroupField
        label="Qué se comparte" name="lms-share-scope" options={SCOPE_OPTIONS} value={settings.scope}
        onChange={(scope) => { if (!busy) onSave({ scope }) }}
        hint="Marca lecciones como vista previa en el editor de cada lección, o marca secciones completas como gratis."
      />
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField
            label="Permitir exámenes" hint="Los invitados presentan los exámenes compartidos. Las respuestas abiertas llegan a Revisión con su nombre."
            checked={settings.allowQuizzes === true} disabled={busy} onChange={(event) => onSave({ allowQuizzes: event.target.checked })}
          />
          <CheckboxField
            label="Permitir tareas" hint="Los invitados entregan las tareas con texto o archivos. Llegan a Revisión con su nombre."
            checked={settings.allowAssignments === true} disabled={busy} onChange={(event) => onSave({ allowAssignments: event.target.checked })}
          />
        </div>
        {invite ? <p className="text-xs text-[hsl(var(--muted-foreground))]">En cursos por invitación, los invitados ven el curso completo.</p> : null}
      </div>
      <CheckboxField
        label="Emitir certificado al completar (requiere plantilla)"
        hint={data.hasCertificateTemplate
          ? 'Al completar las lecciones compartidas, el invitado descarga su certificado con su nombre y los datos del formulario que use la plantilla.'
          : 'Este curso no tiene plantilla de certificado. Elígela en Configuración para que los invitados lo reciban.'}
        checked={settings.issueCertificates === true} disabled={busy} onChange={(event) => onSave({ issueCertificates: event.target.checked })}
      />
      {data.enabled && url ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{invite ? 'Página del curso' : 'Enlace'}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={url} onFocus={(event) => event.target.select()} aria-label="Enlace para compartir" className="font-mono text-xs" />
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? 'Copiado' : 'Copiar'}</Button>
              <Button variant="outline" size="icon" asChild aria-label="Abrir enlace">
                <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink /></a>
              </Button>
            </div>
          </div>
          {invite ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Sin invitación nadie entra: aquí se pide el correo y el código de acceso.</p> : null}
        </div>
      ) : null}
      <Rules settings={settings} />
    </div>
  )
}
