import { useState } from 'react'
import {
  Alert, AlertDescription, Button, CheckboxField, ConfirmDialog, ErrorState, Input, RadioGroupField, SectionCard, Skeleton, SwitchField, TextareaField,
} from '@runly/ui'
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAssessmentShare, useRotateAssessmentShare, useUpdateAssessmentShare } from '../../hooks/useLmsShare.js'
import { absoluteShareUrl } from '../../lib/lmsShare.js'
import { GuestInvitesPanel } from '../share/GuestInvitesPanel.jsx'
import { IntakeFieldsEditor } from '../share/IntakeFieldsEditor.jsx'

const NOTICE_MAX = 4000
const ACCESS_OPTIONS = [
  { value: 'open', label: 'Registro abierto', description: 'Cualquiera con el enlace se registra con sus datos y presenta la evaluación.' },
  { value: 'invite', label: 'Solo por invitación', description: 'Invitas por correo; cada persona entra con su enlace personal y su código.' },
]

function LinkBox({ url }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error('No se pudo copiar. Selecciona el enlace y cópialo a mano.') }
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input readOnly value={url} onFocus={(event) => event.target.select()} aria-label="Enlace de la evaluación" className="font-mono text-xs" />
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? 'Copiado' : 'Copiar'}</Button>
        <Button variant="outline" size="icon" asChild aria-label="Abrir enlace"><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button>
      </div>
    </div>
  )
}

// The notice is a draft saved with its own button: each saved text is a new
// version, and people registered before keep the version they accepted.
function NoticeEditor({ consent, busy, saving, onSave }) {
  const [text, setText] = useState(consent.noticeText ?? '')
  const [required, setRequired] = useState(consent.required === true)
  const dirty = text.trim() !== (consent.noticeText ?? '') || required !== (consent.required === true)
  const error = required && !text.trim() ? 'Escribe el aviso que la persona debe aceptar.' : null
  return (
    <div className="space-y-3">
      <TextareaField
        label="Aviso de privacidad" rows={5} maxLength={NOTICE_MAX} value={text} onChange={(event) => setText(event.target.value)} disabled={busy}
        hint="Quién usa los datos, para qué y cómo ejercer sus derechos. Se muestra en la página antes del registro."
      />
      <CheckboxField
        label="Pedir que acepten el aviso para registrarse" checked={required} disabled={busy} onChange={(event) => setRequired(event.target.checked)}
        hint="Se guarda la versión del aviso que aceptó cada persona y la fecha."
      />
      {error ? <p className="text-sm text-[hsl(var(--destructive))]" role="alert">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{consent.version ? `Versión vigente: ${consent.version}` : 'Sin aviso guardado'}</span>
        <Button onClick={() => onSave({ consent: { noticeText: text, required } })} disabled={busy || saving || !dirty || Boolean(error)}>
          {saving ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Save />}Guardar aviso
        </Button>
      </div>
    </div>
  )
}

// "Compartir" tab of an evaluation: public link for people without a Runly
// account (/app/p/lms/evaluacion/<token>), registration form, privacy notice,
// and the registrations or invitations with their revocation.
export function AssessmentSharePanel({ assessmentId, readOnly = false }) {
  const share = useAssessmentShare(assessmentId)
  const update = useUpdateAssessmentShare(), rotate = useRotateAssessmentShare()
  const [confirmRotate, setConfirmRotate] = useState(false)
  const busy = readOnly || update.isPending || rotate.isPending
  const save = (patch) => update.mutate({ courseId: assessmentId, ...patch })

  if (share.isLoading) return <div className="space-y-3"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
  if (share.isError || !share.data) return <ErrorState title="No se pudo cargar el enlace" description={share.error?.message} onRetry={() => share.refetch()} />
  const data = share.data
  const { settings } = data
  const invite = settings.accessMode === 'invite'
  const url = data.path ? absoluteShareUrl(data) : null

  async function doRotate() {
    try { await rotate.mutateAsync({ courseId: assessmentId }); setConfirmRotate(false) } catch { /* toast shown */ }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <SectionCard title="Enlace público">
        <div className="space-y-5">
          <SwitchField
            id="lms-assessment-share-enabled" label="Enlace activo" description="Desactívalo para que deje de funcionar al instante, incluidas las sesiones en curso."
            checked={data.enabled} onChange={(enabled) => save({ enabled })} disabled={busy}
          />
          {data.enabled && !data.published ? <Alert><AlertDescription>La evaluación no está publicada: el enlace funcionará cuando la publiques.</AlertDescription></Alert> : null}
          <RadioGroupField label="Quién puede presentarla" name="lms-assessment-access" options={ACCESS_OPTIONS} value={settings.accessMode} onChange={(accessMode) => { if (!busy) save({ accessMode }) }} />
          <CheckboxField
            label="Un registro por correo" checked={settings.dedupeByEmail} disabled={busy} onChange={(event) => save({ dedupeByEmail: event.target.checked })}
            hint="Recomendado. Quien ya se registró no puede volver a hacerlo para conseguir otro intento: continúa con un código que le llega a su correo."
          />
          {data.enabled && url ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Enlace</p>
              <LinkBox url={url} />
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setConfirmRotate(true)} disabled={busy}><RefreshCw />Generar nuevo enlace</Button>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>
      <SectionCard title="Privacidad">
        <NoticeEditor key={settings.consent.version ?? 'none'} consent={settings.consent} busy={busy} saving={update.isPending} onSave={save} />
      </SectionCard>
      <SectionCard title="Formulario de registro">
        <IntakeFieldsEditor
          key={JSON.stringify(settings.intakeFields)} fields={settings.intakeFields} accessMode={settings.accessMode} disabled={busy} saving={update.isPending}
          onSave={(intakeFields) => save({ intakeFields })} maxCustom={10} certTags={false} lockedEmail={settings.dedupeByEmail}
          intro="Lo que cada persona escribe antes de iniciar. Pide solo lo necesario: el nombre siempre se pide."
        />
      </SectionCard>
      <SectionCard title={invite ? 'Invitaciones' : 'Registros'}>
        <GuestInvitesPanel
          courseId={assessmentId} kind="assessment" linkReady={Boolean(data.enabled && data.path)} disabled={readOnly}
          canInvite={invite} listLabel={invite ? 'Invitados' : 'Personas registradas'}
          empty={invite ? undefined : { title: 'Sin registros', description: 'Quienes se registren con el enlace aparecerán aquí con su correo y último acceso. Desde aquí puedes revocar un acceso.' }}
        />
      </SectionCard>
      <ConfirmDialog
        open={confirmRotate} onOpenChange={setConfirmRotate} icon={RefreshCw} tone="warning" title="Generar nuevo enlace"
        description="El enlace actual y los enlaces personales dejarán de funcionar de inmediato. Quien ya se registró puede continuar desde el enlace nuevo con un código que le llega a su correo."
        confirmLabel="Generar enlace" loading={rotate.isPending} onConfirm={doRotate}
      />
    </div>
  )
}
