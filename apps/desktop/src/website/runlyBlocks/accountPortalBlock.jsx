// Customer account portal of a published site (External Identity realm of the site): sign in, sign up, forgot/reset
// password, email verification links (/cuenta?accion=verificar|restablecer&t=...) and "Mi cuenta".
// SSR renders the loading state; the session and the URL are only read in effects. Without a runtime config
// (the editor preview) it shows a static, non-networked sign-in form.
import { useEffect, useId, useRef, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { readAtlasConfig } from './catalogPublicClient.js'
import { accountApi, accountErrorMessage } from './accountPublicClient.js'
import { loadTurnstile } from './ContactFormRenderer.jsx'
import { ACCENT, INK, LINE, MUTED, PAPER, SANS, SERIF, Styles, button } from './storeUi.jsx'

const section = { padding: 'clamp(40px, 6vw, 80px) 24px', background: PAPER }
const card = { maxWidth: 460, marginInline: 'auto', display: 'grid', gap: 18 }
const h1 = { margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(30px, 4vw, 44px)', lineHeight: 1.1, color: INK }
const h2 = { margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: 24, color: INK }
const text = { margin: 0, fontFamily: SANS, fontSize: 15, lineHeight: 1.6, color: MUTED }
const link = { background: 'none', border: 0, padding: 0, minHeight: 44, fontFamily: SANS, fontSize: 14, fontWeight: 700, color: ACCENT, cursor: 'pointer', textAlign: 'left' }
const FIELD_CSS = `.ra-input{width:100%;box-sizing:border-box;min-height:46px;padding:11px 14px;border-radius:12px;border:1.5px solid ${LINE};background:#fff;color:${INK};font:inherit;font-family:${SANS}}.ra-input:focus{outline:none;border-color:${ACCENT};box-shadow:0 0 0 3px color-mix(in srgb,${ACCENT} 22%,transparent)}.rs-btn:disabled{opacity:.6;cursor:progress;transform:none}`
const MIN_PASSWORD = 10

function Field({ label, name, type = 'text', autoComplete, required = true, defaultValue, minLength, hint }) {
  const id = useId()
  return (
    <label htmlFor={id} style={{ display: 'grid', gap: 6, fontFamily: SANS, fontSize: 14, fontWeight: 600, color: INK }}>
      {label}
      <input id={id} name={name} type={type} className="ra-input" autoComplete={autoComplete} required={required} defaultValue={defaultValue} minLength={minLength} maxLength={type === 'password' ? 128 : 254} />
      {hint && <span style={{ fontWeight: 400, fontSize: 13, color: MUTED }}>{hint}</span>}
    </label>
  )
}

function Message({ tone, children }) {
  if (!children) return null
  return <p role={tone === 'error' ? 'alert' : 'status'} style={{ ...text, padding: '12px 14px', borderRadius: 12, border: `1px solid ${tone === 'error' ? '#e5484d' : LINE}`, color: tone === 'error' ? '#b42318' : INK, background: tone === 'error' ? 'rgba(229,72,77,.06)' : 'rgba(255,255,255,.6)' }}>{children}</p>
}

function Form({ onSubmit, busy, submitLabel, children }) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
      {children}
      <button type="submit" className="rs-btn" disabled={busy} style={{ ...button(true), width: '100%' }}>{busy ? 'Un momento…' : submitLabel}</button>
    </form>
  )
}

const values = (event) => Object.fromEntries(new FormData(event.currentTarget))
const stripQuery = () => window.history.replaceState(null, '', window.location.pathname)

function AccountPortal() {
  const preview = !readAtlasConfig()?.apiUrl
  const [view, setView] = useState(preview ? 'login' : 'loading')
  const [account, setAccount] = useState(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const turnstileRef = useRef(null)
  const challengeRef = useRef('')
  const siteKey = readAtlasConfig()?.turnstileSiteKey || ''

  const go = (next, note = null) => { setView(next); setMessage(note) }
  const signedIn = (acc, note = null) => { setAccount(acc); go('account', note) }
  const loadSession = (note = null) => accountApi('/me')
    .then((res) => signedIn(res.account, note))
    .catch((error) => go(error.status === 404 ? 'off' : 'login', note))

  useEffect(() => {
    if (preview) return
    const query = new URLSearchParams(window.location.search)
    const action = query.get('accion'), t = query.get('t')
    if (action === 'restablecer' && t) { setToken(t); stripQuery(); go('reset'); return }
    if (action === 'verificar' && t) {
      stripQuery()
      accountApi('/verify-email', { token: t })
        .then(() => loadSession({ tone: 'success', text: 'Tu correo quedó confirmado.' }))
        .catch((error) => (error.status === 404 ? go('off') : loadSession({ tone: 'error', text: accountErrorMessage(error) })))
      return
    }
    loadSession()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view !== 'register' || !siteKey || !turnstileRef.current) return undefined
    let widget = null
    loadTurnstile().then((turnstile) => {
      if (turnstileRef.current) widget = turnstile.render(turnstileRef.current, { sitekey: siteKey, callback: (value) => { challengeRef.current = value } })
    }).catch(() => {})
    return () => { challengeRef.current = ''; if (widget != null) window.turnstile?.remove?.(widget) }
  }, [view, siteKey])

  // Runs one request; maps 404 (accounts off) and 401 (session gone) to their views, anything else to a message.
  const run = (task) => async (event) => {
    event.preventDefault()
    if (preview || busy) return
    const data = values(event)
    setBusy(true); setMessage(null)
    try { await task(data, event.currentTarget) } catch (error) {
      if (error.status === 404) go('off')
      else if (error.status === 401 && view === 'account') { setAccount(null); go('login', { tone: 'error', text: accountErrorMessage({ code: 'UNAUTHENTICATED' }) }) }
      else setMessage({ tone: 'error', text: accountErrorMessage(error) })
    } finally { setBusy(false) }
  }

  const login = run(async ({ email, password }) => signedIn((await accountApi('/login', { email, password })).account))
  const register = run(async ({ displayName, email, password, phone }) => {
    const res = await accountApi('/register', { displayName, email, password, phone: phone?.trim() || null, ...(siteKey ? { turnstileToken: challengeRef.current } : {}) })
    if (res.verificationRequired) go('checkEmail')
    else signedIn(res.account)
  })
  const forgot = run(async ({ email }) => { await accountApi('/password/forgot', { email }); go('login', { tone: 'success', text: 'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.' }) })
  const reset = run(async ({ password, confirm }) => {
    if (password !== confirm) { setMessage({ tone: 'error', text: 'Las contraseñas no coinciden.' }); return }
    await accountApi('/password/reset', { token, password })
    go('login', { tone: 'success', text: 'Tu contraseña se actualizó. Ya puedes iniciar sesión.' })
  })
  const saveProfile = run(async ({ displayName, phone }) => {
    const res = await accountApi('/me', { displayName, phone: phone?.trim() || null })
    signedIn(res.account, { tone: 'success', text: 'Tus datos se guardaron.' })
  })
  const changePassword = run(async ({ currentPassword, newPassword }, form) => {
    await accountApi('/me/password', { currentPassword, newPassword })
    form.reset(); setMessage({ tone: 'success', text: 'Tu contraseña se actualizó.' })
  })
  const resend = run(async () => { await accountApi('/verify-email/request', {}); setMessage({ tone: 'success', text: 'Te enviamos un nuevo correo de confirmación.' }) })
  const logout = run(async () => { await accountApi('/logout', {}); setAccount(null); go('login', { tone: 'success', text: 'Cerraste sesión.' }) })

  const toLink = (target, label) => <button type="button" style={link} onClick={() => go(target)}>{label}</button>
  const passwordHint = `Mínimo ${MIN_PASSWORD} caracteres.`
  let body
  if (view === 'loading') body = <div aria-busy="true" aria-label="Cargando" style={{ height: 280, borderRadius: 20, background: 'rgba(0,0,0,.05)' }} />
  else if (view === 'off') body = <><h1 style={h1}>Mi cuenta</h1><p style={text}>Las cuentas no están disponibles en este sitio.</p></>
  else if (view === 'checkEmail') body = <><h1 style={h1}>Revisa tu correo</h1><p style={text}>Revisa tu correo para confirmar tu cuenta. Después podrás iniciar sesión.</p>{toLink('login', 'Ir a iniciar sesión')}</>
  else if (view === 'register') body = (
    <>
      <h1 style={h1}>Crear cuenta</h1>
      <Message {...message}>{message?.text}</Message>
      <Form onSubmit={register} busy={busy} submitLabel="Crear cuenta">
        <Field label="Nombre" name="displayName" autoComplete="name" />
        <Field label="Correo" name="email" type="email" autoComplete="email" />
        <Field label="Contraseña" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} hint={passwordHint} />
        <Field label="Teléfono (opcional)" name="phone" type="tel" autoComplete="tel" required={false} />
        {siteKey && <div ref={turnstileRef} />}
      </Form>
      <p style={text}>¿Ya tienes cuenta? {toLink('login', 'Iniciar sesión')}</p>
    </>
  )
  else if (view === 'forgot') body = (
    <>
      <h1 style={h1}>¿Olvidaste tu contraseña?</h1>
      <p style={text}>Escribe tu correo y te enviaremos un enlace para crear una nueva.</p>
      <Message {...message}>{message?.text}</Message>
      <Form onSubmit={forgot} busy={busy} submitLabel="Enviar enlace"><Field label="Correo" name="email" type="email" autoComplete="email" /></Form>
      {toLink('login', 'Volver a iniciar sesión')}
    </>
  )
  else if (view === 'reset') body = (
    <>
      <h1 style={h1}>Nueva contraseña</h1>
      <Message {...message}>{message?.text}</Message>
      <Form onSubmit={reset} busy={busy} submitLabel="Guardar contraseña">
        <Field label="Nueva contraseña" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} hint={passwordHint} />
        <Field label="Confirmar contraseña" name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} />
      </Form>
    </>
  )
  else if (view === 'account' && account) body = (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div><h1 style={h1}>Mi cuenta</h1><p style={{ ...text, marginTop: 6 }}>{account.email}</p></div>
        <form onSubmit={logout}><button type="submit" className="rs-btn" disabled={busy} style={button(false)}>Cerrar sesión</button></form>
      </div>
      <Message {...message}>{message?.text}</Message>
      {!account.emailVerified && (
        <div style={{ display: 'grid', gap: 8, padding: '14px 16px', borderRadius: 12, border: `1px solid ${LINE}`, background: 'rgba(255,255,255,.6)' }}>
          <p style={{ ...text, color: INK }}>Tu correo aún no está confirmado. Revisa tu bandeja de entrada.</p>
          <form onSubmit={resend}><button type="submit" style={link} disabled={busy}>Reenviar correo</button></form>
        </div>
      )}
      <h2 style={h2}>Tus datos</h2>
      <Form onSubmit={saveProfile} busy={busy} submitLabel="Guardar datos">
        <Field label="Nombre" name="displayName" autoComplete="name" defaultValue={account.displayName ?? ''} />
        <Field label="Teléfono (opcional)" name="phone" type="tel" autoComplete="tel" required={false} defaultValue={account.phone ?? ''} />
      </Form>
      <h2 style={h2}>Cambiar contraseña</h2>
      <Form onSubmit={changePassword} busy={busy} submitLabel="Cambiar contraseña">
        <Field label="Contraseña actual" name="currentPassword" type="password" autoComplete="current-password" />
        <Field label="Nueva contraseña" name="newPassword" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} hint={passwordHint} />
      </Form>
    </>
  )
  else body = (
    <>
      <h1 style={h1}>Iniciar sesión</h1>
      <Message {...message}>{message?.text}</Message>
      <Form onSubmit={login} busy={busy} submitLabel="Iniciar sesión">
        <Field label="Correo" name="email" type="email" autoComplete="email" />
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" />
      </Form>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
        {toLink('register', 'Crear cuenta')}
        {toLink('forgot', '¿Olvidaste tu contraseña?')}
      </div>
    </>
  )

  return (
    <section style={section}>
      <Styles /><style>{FIELD_CSS}</style>
      <div style={card}>{body}</div>
    </section>
  )
}

export const AccountPortalBlock = defineBlock({
  type: 'AccountPortalBlock',
  label: 'Cuenta de cliente',
  category: 'atlas',
  defaultProps: {},
  fields: {},
  render: () => <AccountPortal />,
})
