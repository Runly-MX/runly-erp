import { useState } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Video, Mail, Lock, User, ArrowRight, CheckCircle2, AlertCircle, ShieldCheck, Layers, CalendarCheck, ShoppingCart, Package, PenTool, BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TextField, PasswordField, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@runly/ui'
import { clearServerUrl, isTauriRuntime } from '../lib/serverStore.js'
import { runly } from '../lib/runly'
import { useQueryClient } from '@tanstack/react-query'
import { instanceStatusQuery } from '../lib/instanceStatusQuery'
import { useAuth } from './AuthProvider'
import { normalizeAuthReturnPath } from './authReturnPath.js'
import { useThemeStore } from '../stores/theme'
import { RUNLY_EDITION_NAME } from '../lib/appConfig.js'
import { native } from '../native/index.js'
import { getApiUrl } from '../lib/runtimeConfig.js'
import { LoginAurora } from './LoginAurora.jsx'

const LOGO = '/runly/runly-logo-dark-sm.png'
const LOGIN_GRADIENT = { backgroundImage: 'linear-gradient(90deg,#f97316,#ec4899)' }

// Marketing tiles describing what Runly covers, not this instance's installed
// modules: the screen renders before sign-in and must not query them.
const MODULE_TILES = [
  { icon: Layers, label: 'Operaciones', color: '#38bdf8' },
  { icon: CalendarCheck, label: 'Reservas', color: '#e879f9' },
  { icon: ShoppingCart, label: 'Ventas', color: '#fb923c' },
  { icon: Package, label: 'Inventario', color: '#fbbf24' },
  { icon: PenTool, label: 'Studio', color: '#c084fc' },
  { icon: BarChart3, label: 'Reportes', color: '#4ade80' },
]

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
  const queryClient = useQueryClient()
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

  // The login is dark-only; restore the user's theme when leaving it.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('dark')
    return () => root.classList.toggle('dark', useThemeStore.getState().isDark)
  }, [])

  // The form is already usable: fetch the authenticated shell and the landing screen while the
  // person types, so signing in does not start a download waterfall. Idle time only, never blocks the form.
  useEffect(() => {
    const prefetch = () => {
      import("../app/AuthenticatedShell.jsx").catch(() => {})
      import("../app/HomeScreen").catch(() => {})
    }
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(prefetch, 2000)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    let mounted = true
    queryClient.fetchQuery(instanceStatusQuery)
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
  }, [navigate, queryClient])

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
    <div className="relative min-h-dvh overflow-x-hidden text-foreground">
      <LoginAurora />

      <div className="relative z-10 min-h-dvh max-w-350 mx-auto flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-10 px-4 sm:px-8 lg:px-14 pt-[calc(var(--sat)+1.25rem)] pb-[calc(var(--sab)+1.25rem)] lg:py-12">
        {/* Hero. Never shows a specific company's branding: this screen is
            shared across every company on the instance. */}
        <section className="flex flex-col lg:justify-between gap-10">
          <div className="flex items-center gap-4">
            <img src={LOGO} alt="Runly" className="h-7 lg:h-8 w-auto object-contain" draggable={false} />
            <span className="h-6 w-px bg-white/25" />
            <span className="text-sm font-semibold tracking-[0.3em] text-white/80">ERP</span>
          </div>

          <div className="hidden lg:flex flex-col gap-6 max-w-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-700">
            <h1 className="text-[clamp(2.6rem,4.6vw,4.2rem)] font-extrabold leading-[1.02] tracking-tight text-white">
              Todo tu negocio.
              <br />
              En{' '}
              <span className="relative inline-block">
                movimiento.
                <svg aria-hidden="true" viewBox="0 0 300 16" preserveAspectRatio="none" className="absolute left-[4%] -bottom-3 w-[92%] h-3.5">
                  <path d="M3 11 C 80 3, 200 3, 297 9" fill="none" stroke="url(#login-underline)" strokeWidth="5" strokeLinecap="round" />
                  <defs>
                    <linearGradient id="login-underline" x1="0" x2="1">
                      <stop offset="0" stopColor="#f97316" />
                      <stop offset="1" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
            </h1>
            <p className="text-lg leading-relaxed text-white/70 max-w-[40ch]">
              Una plataforma modular, flexible y escalable para gestionar y hacer crecer tu operación.
            </p>
          </div>

          <ul className="hidden lg:flex flex-wrap gap-3" role="list">
            {MODULE_TILES.map(({ icon: Icon, label, color }, i) => (
              <li
                key={label}
                style={{ animationDelay: `${300 + i * 70}ms`, '--tile': color }}
                className="w-24 h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md text-center transition hover:-translate-y-1 hover:bg-white/[0.08] hover:border-(--tile)/50 hover:shadow-[0_12px_30px_-12px_var(--tile)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 duration-500 fill-mode-both"
              >
                <Icon size={26} strokeWidth={1.75} style={{ color }} aria-hidden="true" />
                <span className="text-[12px] font-medium leading-tight text-white/85">{label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Form card: gradient hairline border around frosted glass. */}
        <section className="flex-1 flex items-center justify-center mt-8 lg:mt-0">
          <div className="w-full max-w-md lg:max-w-none motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-700 rounded-[28px] p-px bg-gradient-to-br from-white/25 via-white/5 to-pink-500/40 shadow-[0_30px_80px_-20px_rgba(0,0,0,.7)]">
            <div className="rounded-[27px] bg-[#0b1430]/70 backdrop-blur-2xl px-6 py-8 sm:px-10 sm:py-10">
              <div className="flex flex-col items-center text-center gap-2 mb-8">
                <img src="/runly/runly-isotipo-dark-sm.png" alt="" className="h-12 w-12 mb-2 object-contain" draggable={false} />
                <h2 className="text-[1.75rem] font-bold tracking-tight text-white">Bienvenido de nuevo</h2>
                <p className="text-sm text-white/65">Ingresa a tu espacio de trabajo</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                <TextField
                  id="identifier"
                  icon={User}
                  label="Correo o usuario"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="tu@empresa.com o usuario"
                />
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
                  className="-mt-1 self-end text-[13px] font-medium text-sky-400 hover:text-sky-300 transition-colors duration-150 cursor-pointer"
                >
                  ¿Olvidaste tu contraseña?
                </button>

                {error && (
                  <p role="alert" className="text-sm text-red-400">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="gradient"
                  style={LOGIN_GRADIENT}
                  disabled={loading || !identifier.trim() || !password}
                  aria-busy={loading}
                  className="mt-1 h-12 sm:h-12 w-full justify-center rounded-md text-[15px] font-semibold shadow-[0_10px_30px_-8px_rgba(249,115,22,.6)] hover:brightness-110"
                >
                  {loading ? 'Verificando credenciales...' : 'Iniciar sesión'}
                  {!loading && <ArrowRight size={17} />}
                </Button>
              </form>

              <div className="flex items-center gap-3 my-6 text-xs text-white/50">
                <span className="h-px flex-1 bg-white/15" />o también<span className="h-px flex-1 bg-white/15" />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/app/p/call')}
                className="h-11 sm:h-11 w-full justify-center rounded-md border-white/15 bg-white/[0.04] text-white/90 hover:bg-white/[0.08]"
              >
                <Video size={16} />
                Unirse a una reunión sin cuenta
              </Button>

              <div className="mt-6 flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-white/70">
                <ShieldCheck size={15} className="shrink-0 text-emerald-400" aria-hidden="true" />
                <span className="truncate">
                  Conexión segura · <span title={instanceHost}>{instanceHost}</span>
                </span>
                {isTauriRuntime() || native.isRemoteHost() ? (
                  <button
                    type="button"
                    onClick={() => handleChangeServer()}
                    className="ml-auto shrink-0 font-medium text-orange-400 hover:text-orange-300 cursor-pointer"
                  >
                    Cambiar
                  </button>
                ) : null}
              </div>
              {native.isRemoteHost() && (
                <button
                  type="button"
                  onClick={() => handleChangeServer('device')}
                  className="mt-3 w-full text-center text-xs text-white/55 hover:text-white cursor-pointer"
                >
                  Permisos del dispositivo
                </button>
              )}
            </div>
          </div>
        </section>

        <p className="mt-6 lg:col-span-2 text-center lg:text-left text-[11px] uppercase tracking-[0.16em] text-white/45">
          Runly ERP · {RUNLY_EDITION_NAME}
        </p>
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
