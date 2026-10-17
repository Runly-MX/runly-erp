import { useState } from 'react'
import { Button, TextField } from '@runly/ui'
import { KeyRound, Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { useGuestAccess } from '../hooks/useLmsShare.js'
import { EMAIL_KEY, validateIntakeForm } from '../lib/lmsIntake.js'
import { GuestIntakeFields } from './GuestIntakeFields.jsx'

const MUTED = 'text-sm text-[hsl(var(--muted-foreground))]'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function accessError(error) {
  if (error?.status === 429) return error?.details?.code === 'INVITE_LOCKED' ? error.message : 'Demasiados intentos. Espera un momento.'
  return error?.message || 'No se pudo validar tu código.'
}

// Invite-only course: the guest types the access code (plus the email when the
// personal link `?i=` is missing). The first time, the intake form follows; the
// server then returns the guest token. Entering on another device signs out
// the previous one.
export function SharedCourseInviteForm({ shareToken, linkToken = null, fields = [], disabled = false, onJoined }) {
  const access = useGuestAccess(shareToken)
  const [step, setStep] = useState('code')
  const [credentials, setCredentials] = useState({ email: '', code: '' })
  const [profile, setProfile] = useState({ name: '', answers: {} })
  const [invited, setInvited] = useState(null)
  const [errors, setErrors] = useState({})

  const base = () => ({ ...(linkToken ? { i: linkToken } : { email: credentials.email.trim().toLowerCase() }), code: credentials.code.trim() })

  async function send(data) {
    try {
      const result = await access.mutateAsync(data)
      if (result.needsProfile) {
        setInvited(result.guest)
        setProfile((current) => ({ ...current, name: current.name || result.guest?.name || '' }))
        setStep('profile')
        return
      }
      onJoined(result.guestToken)
    } catch (error) {
      if (error?.details?.code === 'INVITE_ACTIVE') setStep('code')
      toast.error(accessError(error))
    }
  }

  function submitCode(event) {
    event.preventDefault()
    const next = {}
    if (!linkToken && !EMAIL_RE.test(credentials.email.trim())) next.email = 'Escribe el correo con el que te invitaron.'
    if (credentials.code.replace(/[\s-]/g, '').length !== 8) next.code = 'El código tiene 8 caracteres.'
    setErrors(next)
    if (!Object.keys(next).length) send(base())
  }

  function submitProfile(event) {
    event.preventDefault()
    const result = validateIntakeForm(profile, fields, { skip: [EMAIL_KEY] })
    setErrors(result.errors)
    if (!Object.keys(result.errors).length) send({ ...base(), name: result.values.name, answers: result.values.answers })
  }

  const busy = disabled || access.isPending
  const icon = access.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <LogIn />

  if (step === 'profile') {
    return (
      <form onSubmit={submitProfile} className="space-y-4" noValidate>
        <div>
          <h2 className="text-base font-semibold">Completa tus datos</h2>
          <p className={MUTED}>Solo la primera vez. Entras como {invited?.email}.</p>
        </div>
        <GuestIntakeFields fields={fields} values={profile} errors={errors} onChange={setProfile} skip={[EMAIL_KEY]} disabled={busy} />
        <Button type="submit" className="w-full" disabled={busy}>{icon}Entrar al curso</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => setStep('code')} disabled={busy}>Volver</Button>
      </form>
    )
  }

  const set = (key) => (event) => setCredentials((current) => ({ ...current, [key]: event.target.value }))
  return (
    <form onSubmit={submitCode} className="space-y-4" noValidate>
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold"><KeyRound className="h-4 w-4" aria-hidden="true" />Entrar con tu invitación</h2>
        <p className={MUTED}>
          {linkToken ? 'Escribe el código de acceso que recibiste por correo.' : 'Escribe tu correo y el código de acceso que recibiste por correo.'}
        </p>
      </div>
      {!linkToken ? <TextField label="Correo" type="email" required value={credentials.email} onChange={set('email')} error={errors.email} maxLength={200} autoComplete="email" disabled={busy} /> : null}
      <TextField
        label="Código de acceso" required value={credentials.code} onChange={set('code')} error={errors.code} maxLength={12}
        autoComplete="one-time-code" placeholder="ABCD-EFGH" className="font-mono uppercase tracking-widest" disabled={busy}
      />
      <Button type="submit" className="w-full" disabled={busy}>{icon}Entrar</Button>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Puedes continuar en cualquier dispositivo con tu correo y código. Al entrar en otro dispositivo se cierra la sesión anterior.</p>
    </form>
  )
}
