import { useState } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Server, Video, Mail, Lock, User, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TextField, PasswordField, Button, AuthAtmosphere, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@runly/ui'
import { clearServerUrl, isTauriRuntime } from '../lib/serverStore.js'
import { runly } from '../lib/runly'
import { useAuth } from './AuthProvider'
import { normalizeAuthReturnPath } from './authReturnPath.js'
import { useThemeStore } from '../stores/theme'
import { ThemeToggle } from '../components/ThemeToggle'
import { RUNLY_EDITION_NAME } from '../lib/appConfig.js'
import { native } from '../native/index.js'
import { getApiUrl } from '../lib/runtimeConfig.js'
import { LoginShowcase } from './LoginShowcase.jsx'

function apiHost() {
  try { return new URL(getApiUrl(), window.location.href).host }
  catch { return window.location.host }
}

const CTA_GRADIENT = { backgroundImage: 'linear-gradient(120deg,#FD6016,#E4262A)' }

// Same shape the API validates with on POST /auth/forgot-password — kept in
// sync so "well-formed enough to submit" means the same thing on both sides.
// Values without "@" are usernames and are resolved by the API.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function isValidIdentifier(value) {
  const v = String(value ?? '').trim()
  return v.includes('@') ? EMAIL_RE.test(v) : v.length > 0
}

export function LoginScreen({ returnTo = '/app' }) {
  const navigate = useNavigate()
  const destination = normalizeAuthReturnPath(returnTo)
  const { session, loading: authLoading } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const instanceHost = apiHost()
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  // 'form' | 'sending' | 'sent' | 'error' — 'error' is only for a real
  // request failure (server unreachable), never for "email doesn't exist":
  // that must stay indistinguishable from success so the endpoint can't be
  // used to enumerate accounts.
  const [forgotPhase, setForgotPhase] = useState('form')
  const [forgotError, setForgotError] = useState('')
  const isDark = useThemeStore((s) => s.isDark)
  const logo = isDark ? '/runly/runly-logo-dark.png' : '/runly/runly-logo-light.png'

  useEffect(() => {
    let mounted = true
    runly.instance.status()
      .then((data) => {
        if (!mounted) return
        if (!data?.initialized) {
          navigate('/app/setup', { replace: true })
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [navigate])

  useEffect(() => {
    if (authLoading) return
    if (session) {
      navigate(destination, { replace: true })
    }
  }, [authLoading, destination, navigate, session])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!identifier.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      // The API resolves a username to its email and signs in server-side;
      // setSession hands the tokens to the same client AuthProvider listens to.
      const { data } = await runly.auth.login({ identifier: identifier.trim(), password })
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })
      if (sessionError) throw sessionError
      navigate(destination, { replace: true })
    } catch (err) {
      if (err?.status === 401) setError('Credenciales incorrectas. Verifica tus datos e intenta de nuevo.')
      else if (err?.status === 403 || err?.status === 429) setError(err.message)
      else setError('Sin conexión con el servidor. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotSubmit(e) {
    e.preventDefault()
    if (!isValidIdentifier(forgotEmail)) return
    setForgotPhase('sending')
    setForgotError('')
    try {
      await runly.auth.forgotPassword(forgotEmail.trim())
      setForgotPhase('sent')
    } catch (err) {
      // A 400 here is real (malformed email) — show it inline. Anything else
      // (network down, unreachable API) gets a generic retry state; the
      // endpoint itself never reveals whether the address has an account.
      if (err?.status === 400) {
        setForgotError(err.message || 'Ingresa un correo válido.')
        setForgotPhase('form')
      } else {
        setForgotPhase('error')
      }
    }
  }

  function closeForgotDialog() {
    setForgotOpen(false)
    setForgotError('')
    // Reset after the close animation finishes so the form doesn't visibly
    // flash back to its initial state while the dialog is still fading out.
    setTimeout(() => setForgotPhase('form'), 200)
  }

  async function handleChangeServer(section = 'manage') {
    if (native.isRemoteHost()) {
      try { await native.instances.open(section) }
      catch (error) { setError(error.message || 'Actualiza la app Runly para cambiar de instancia.') }
      return
    }
    await supabase.auth.signOut().catch(() => {})
    await clearServerUrl().catch(() => {})
    window.location.reload()
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <AuthAtmosphere />

      {/* Caps how wide the layout grows on ultra-wide monitors. Below lg only
          the form column renders, and the page scrolls so the mobile keyboard
          never hides the submit button. */}
      <div className="relative min-h-dvh max-w-350 mx-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-6">
        {/* Hero — desktop only. Never shows a specific company's branding:
            this screen is shared across every company on the instance. */}
        <section className="hidden lg:flex relative z-10 flex-col justify-between gap-8 px-13 py-12">
          <img src={logo} alt="Runly" className="h-7.5 w-auto self-start object-contain" draggable={false} />

          <div className="flex flex-col gap-3 max-w-lg">
            <h1 className="text-[clamp(2rem,3.4vw,2.9rem)] font-bold leading-[1.08] tracking-tight text-foreground text-pretty">
              Toda tu operación,{' '}
              <span className="bg-clip-text text-transparent" style={CTA_GRADIENT}>en un solo lugar.</span>
            </h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground max-w-[44ch]">
              Ventas, agenda, inventario y tu equipo trabajando sobre los mismos datos, en tu propia infraestructura.
            </p>
          </div>

          <div className="max-w-2xl w-full">
            <LoginShowcase />
          </div>

          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>Runly ERP · {RUNLY_EDITION_NAME}</span>
            <span>v0.1.0</span>
          </div>
        </section>

        {/* Form panel */}
        <section className="relative z-10 min-h-dvh flex flex-col px-4 sm:px-8 lg:px-10 pt-[calc(var(--sat)+1rem)] pb-[calc(var(--sab)+1rem)]">
          <div className="w-full max-w-md mx-auto my-auto flex flex-col rounded-[26px] glass-shell px-6 py-7 sm:px-9 sm:py-9">
            <div className="flex items-center gap-4 mb-7">
              <img src={logo} alt="Runly" className="h-6 w-auto object-contain lg:hidden" draggable={false} />
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mb-7">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Bienvenido de nuevo</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">Ingresa a tu espacio de trabajo.</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <TextField
                id="identifier"
                icon={User}
                label="Correo o nombre de usuario"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="tu@empresa.com o usuario"
                required
              />
              <div className="flex flex-col gap-1.5">
                <PasswordField
                  id="password"
                  icon={Lock}
                  label="Contraseña"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
                  hint={capsLock ? 'Bloq Mayús está activado.' : undefined}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(identifier.trim())
                    setForgotOpen(true)
                  }}
                  className="self-end text-[13px] font-medium text-(--brand-primary) hover:text-(--brand-primary-hover) transition-colors duration-150 cursor-pointer"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="gradient"
                style={CTA_GRADIENT}
                className="w-full justify-center"
                disabled={loading || !identifier.trim() || !password}
                aria-busy={loading}
              >
                {loading ? 'Verificando credenciales...' : 'Iniciar sesión'}
                {!loading && <ArrowRight size={15} />}
              </Button>
            </form>

            <div className="flex items-center gap-3 my-5 text-[11px] uppercase tracking-widest text-muted-foreground">
              <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
            </div>

            <Button type="button" variant="outline" className="w-full justify-center" onClick={() => navigate('/app/p/call')}>
              <Video size={15} />
              Unirse a una reunión sin cuenta
            </Button>

            <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 min-w-0">
                <Server size={13} className="shrink-0" aria-hidden="true" />
                <span className="truncate" title={instanceHost}>{instanceHost}</span>
              </span>
              {isTauriRuntime() || native.isRemoteHost() ? (
                <button
                  type="button"
                  onClick={() => handleChangeServer()}
                  className="ml-auto font-medium text-(--brand-primary) hover:text-(--brand-primary-hover) cursor-pointer"
                >
                  Cambiar instancia
                </button>
              ) : null}
              {native.isRemoteHost() && (
                <button
                  type="button"
                  onClick={() => handleChangeServer('device')}
                  className="hover:text-foreground cursor-pointer"
                >
                  Permisos del dispositivo
                </button>
              )}
            </div>
          </div>

          <p className="lg:hidden mt-4 text-center text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Runly ERP · {RUNLY_EDITION_NAME}
          </p>
        </section>
      </div>


      <Dialog open={forgotOpen} onOpenChange={(open) => (open ? setForgotOpen(true) : closeForgotDialog())}>
        <DialogContent size="sm">
          {forgotPhase === 'sent' ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="grid place-items-center h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-500 animate-in zoom-in-50 duration-300">
                <CheckCircle2 size={26} />
              </div>
              <DialogTitle>Enlace enviado</DialogTitle>
              <DialogDescription>
                Si la cuenta existe, enviamos un enlace para restablecer la contraseña al correo asociado. Revisa tu bandeja de entrada (y spam).
              </DialogDescription>
              <Button type="button" variant="outline" className="mt-2 w-full justify-center" onClick={closeForgotDialog}>
                Entendido
              </Button>
            </div>
          ) : forgotPhase === 'error' ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="grid place-items-center h-12 w-12 rounded-full bg-destructive/10 text-destructive animate-in zoom-in-50 duration-300">
                <AlertCircle size={26} />
              </div>
              <DialogTitle>No se pudo enviar</DialogTitle>
              <DialogDescription>
                No pudimos conectar con el servidor. Verifica tu conexión e intenta de nuevo.
              </DialogDescription>
              <Button type="button" variant="outline" className="mt-2 w-full justify-center" onClick={() => setForgotPhase('form')}>
                Reintentar
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Restablecer contraseña</DialogTitle>
                <DialogDescription>
                  Ingresa tu correo o nombre de usuario y te enviaremos un enlace para elegir una nueva contraseña.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3 pt-1">
                <TextField
                  id="forgot-email"
                  icon={Mail}
                  label="Correo o nombre de usuario"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="tu@empresa.com o usuario"
                  required
                  autoFocus
                />
                {forgotError && (
                  <p role="alert" className="text-sm text-destructive">{forgotError}</p>
                )}
                <Button
                  type="submit"
                  variant="gradient"
                  style={CTA_GRADIENT}
                  className="w-full justify-center"
                  disabled={forgotPhase === 'sending' || !isValidIdentifier(forgotEmail)}
                  aria-busy={forgotPhase === 'sending'}
                >
                  {forgotPhase === 'sending' ? 'Enviando...' : 'Enviar enlace de restablecimiento'}
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
