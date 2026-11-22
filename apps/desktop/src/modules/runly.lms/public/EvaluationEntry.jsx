import { useState } from 'react'
import { Button, CheckboxField, TextField } from '@runly/ui'
import { Loader2, LogIn, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { useEvaluationAccess, useEvaluationRegister, useEvaluationResume } from '../hooks/useEvaluationLink.js'
import { validateIntakeForm } from '../lib/lmsIntake.js'
import { GuestIntakeFields } from './GuestIntakeFields.jsx'
import { SharedCourseInviteForm } from './SharedCourseInviteForm.jsx'
import { JOIN_FORM_CLASS, keepFieldVisible } from './keyboardSafeFocus.js'

const MUTED = 'text-sm text-[hsl(var(--muted-foreground))]'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const code = (error) => error?.details?.code ?? null

// The notice is accepted by version: if it changes while the person reads, the
// server refuses the old version and the page reloads the new text.
function useConsent(consent) {
  const [accepted, setAccepted] = useState(false)
  const asked = Boolean(consent?.noticeText)
  return {
    node: (error) => (asked ? (
      <CheckboxField
        label={consent.required ? 'Leí y acepto el aviso de privacidad' : 'Leí el aviso de privacidad'}
        hint={<a href="#aviso-privacidad" className="underline underline-offset-2">Leer el aviso</a>}
        checked={accepted} onChange={(event) => setAccepted(event.target.checked)} error={error}
      />
    ) : null),
    error: () => (consent?.required && !accepted ? 'Debes aceptar el aviso para registrarte.' : null),
    body: () => (asked && accepted ? { consent: { accepted: true, version: consent.version } } : {}),
  }
}

function RegisterForm({ linkToken, data, onJoined, onResume, onNoticeChanged }) {
  const register = useEvaluationRegister(linkToken)
  const [values, setValues] = useState({ name: '', answers: {} })
  const [errors, setErrors] = useState({})
  const consent = useConsent(data.settings.consent)
  const fields = data.settings.intakeFields
  const blocked = data.assessment.availability !== 'open'

  async function submit(event) {
    event.preventDefault()
    const result = validateIntakeForm(values, fields)
    const consentError = consent.error()
    setErrors(consentError ? { ...result.errors, consent: consentError } : result.errors)
    if (Object.keys(result.errors).length || consentError) return
    try {
      const joined = await register.mutateAsync({ data: { ...result.values, ...consent.body() } })
      onJoined(joined.guestToken)
    } catch (error) {
      if (code(error) === 'ALREADY_REGISTERED') { toast.info(error.message); onResume(result.values.answers.correo ?? ''); return }
      if (code(error) === 'CONSENT_CHANGED') { toast.warning(error.message); onNoticeChanged(); return }
      toast.error(error?.status === 429 ? 'Demasiados intentos. Espera un momento.' : error.message || 'No se pudo completar el registro.')
    }
  }

  return (
    <form onSubmit={submit} onFocus={keepFieldVisible} className={JOIN_FORM_CLASS} noValidate aria-label="Registro">
      <div>
        <h2 className="text-base font-semibold">Registro</h2>
        <p className={MUTED}>No necesitas cuenta. Registrarte no inicia el cronómetro.</p>
      </div>
      <GuestIntakeFields fields={fields} values={values} errors={errors} onChange={setValues} disabled={register.isPending || blocked} />
      {consent.node(errors.consent)}
      <Button type="submit" className="w-full max-sm:h-11" disabled={register.isPending || blocked}>
        {register.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <LogIn />}Registrarme
      </Button>
      {data.settings.dedupeByEmail ? (
        <Button type="button" variant="ghost" className="w-full max-sm:h-11" onClick={() => onResume('')}>Ya me registré: continuar con un código</Button>
      ) : null}
    </form>
  )
}

// Registered people on another device (or after clearing the browser): ask
// for a code by email, then enter with email + code (the same access flow as
// invitations). The answer never says whether the email is registered.
function ResumeForm({ linkToken, email: initialEmail, onJoined, onBack }) {
  const resume = useEvaluationResume(linkToken)
  const access = useEvaluationAccess(linkToken)
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function ask(event) {
    event.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return setError('Escribe el correo con el que te registraste.')
    setError(null)
    try {
      const result = await resume.mutateAsync({ email: email.trim().toLowerCase() })
      toast.success(result.message)
      setSent(true)
    } catch (err) { toast.error(err?.status === 429 ? 'Demasiados intentos. Espera un momento.' : err.message) }
  }

  if (sent) {
    return (
      <div className="space-y-3">
        <SharedCourseInviteForm
          shareToken={linkToken} access={access} noun="evaluación" onJoined={onJoined}
          title="Continuar con un código" hint={`Escribe tu correo y el código que te enviamos${email ? ` a ${email.trim()}` : ''}.`}
        />
        <Button type="button" variant="ghost" className="w-full max-sm:h-11" onClick={() => setSent(false)}>Pedir otro código</Button>
      </div>
    )
  }
  return (
    <form onSubmit={ask} onFocus={keepFieldVisible} className={JOIN_FORM_CLASS} noValidate aria-label="Continuar con un código">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold"><Mail className="h-4 w-4" aria-hidden="true" />Continuar donde te quedaste</h2>
        <p className={MUTED}>Te enviamos un código al correo con el que te registraste. Tu tiempo sigue corriendo si ya habías iniciado.</p>
      </div>
      <TextField label="Correo" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} error={error ?? undefined} maxLength={200} autoComplete="email" />
      <Button type="submit" className="w-full max-sm:h-11" disabled={resume.isPending}>
        {resume.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Mail />}Enviarme un código
      </Button>
      <Button type="button" variant="ghost" className="w-full max-sm:h-11" onClick={() => setSent(true)}>Ya tengo un código</Button>
      <Button type="button" variant="ghost" className="w-full max-sm:h-11" onClick={onBack}>Volver al registro</Button>
    </form>
  )
}

function InvitedForm({ linkToken, inviteLink, data, onJoined }) {
  const access = useEvaluationAccess(linkToken)
  const consent = useConsent(data.settings.consent)
  return (
    <SharedCourseInviteForm
      shareToken={linkToken} linkToken={inviteLink} fields={data.settings.intakeFields} access={access} noun="evaluación" consent={consent} onJoined={onJoined}
    />
  )
}

// The entry box of the public page: open registration, continue with a code,
// or the invited person's code (invite-only links).
export function EvaluationEntry({ linkToken, inviteLink, data, onJoined, onNoticeChanged }) {
  const [resumeEmail, setResumeEmail] = useState(null)
  if (data.settings.accessMode === 'invite') return <InvitedForm linkToken={linkToken} inviteLink={inviteLink} data={data} onJoined={onJoined} />
  if (resumeEmail !== null) return <ResumeForm linkToken={linkToken} email={resumeEmail} onJoined={onJoined} onBack={() => setResumeEmail(null)} />
  return <RegisterForm linkToken={linkToken} data={data} onJoined={onJoined} onResume={setResumeEmail} onNoticeChanged={onNoticeChanged} />
}
