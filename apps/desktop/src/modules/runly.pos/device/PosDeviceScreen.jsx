// apps/desktop/src/modules/runly.pos/device/PosDeviceScreen.jsx
//
// A register opened from a link, with no ERP login: the device pairs once
// with a code an admin approves, then each cashier enters with a PIN. Only
// the register is reachable; the operator token works on /pos/v2/* only.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, Skeleton, cn } from '@runly/ui'
import { Delete, Link2Off, LogIn, Store } from 'lucide-react'
import { AuthContext } from '../../../auth/AuthProvider.jsx'
import { ActiveCompanyContext } from '../../../company/ActiveCompanyProvider'
import { runly, setActiveCompanyId } from '../../../lib/runly.js'
import { RetailCajaView } from '../retail/RetailCajaScreen.jsx'
import PosThemeScope from '../components/PosThemeScope.jsx'
import { selectionKey } from '../retail/lib/retailRules.js'

const read = (storage, key) => { try { return JSON.parse(storage.getItem(key) ?? 'null') } catch { return null } }
const write = (storage, key, value) => { try { if (value) storage.setItem(key, JSON.stringify(value)); else storage.removeItem(key) } catch { /* private mode */ } }

export default function PosDeviceScreen() {
  const { link } = useParams()
  const deviceKey = `runly-pos-device:${link}`
  const operatorKey = `runly-pos-operator:${link}`
  const [deviceToken, setDeviceToken] = useState(() => read(localStorage, deviceKey))
  const [operator, setOperator] = useState(() => {
    const saved = read(sessionStorage, operatorKey)
    return saved && Date.parse(saved.expiresAt) > Date.now() ? saved : null
  })
  const info = useQuery({ queryKey: ['pos-device-info', link], queryFn: () => runly.pos.device.info(link), retry: false })

  const forgetDevice = useCallback(() => { write(localStorage, deviceKey, null); setDeviceToken(null) }, [deviceKey])
  const signOut = useCallback(() => { write(sessionStorage, operatorKey, null); setOperator(null) }, [operatorKey])
  const signIn = useCallback((session) => { write(sessionStorage, operatorKey, session); setOperator(session) }, [operatorKey])

  // The link was reset or revoked while this device kept its token.
  useEffect(() => { if (info.data?.data && !info.data.data.paired && deviceToken) forgetDevice() }, [info.data, deviceToken, forgetDevice])

  let body
  if (info.isPending) body = <Skeleton className="mx-auto mt-24 h-80 w-full max-w-sm rounded-3xl" />
  else if (info.isError) body = <div className="pt-24"><EmptyState icon={Link2Off} title="Este enlace de caja no está disponible" description="Pide a un administrador un enlace nuevo." /></div>
  else if (!deviceToken) body = <PairingCard link={link} info={info.data.data} onPaired={async (token) => { write(localStorage, deviceKey, token); await info.refetch(); setDeviceToken(token) }} />
  else if (!operator) body = <PinPad link={link} info={info.data.data} deviceToken={deviceToken} onSignIn={signIn} onDeviceRejected={forgetDevice} />
  else return <DeviceRegister operator={operator} onSignOut={signOut} />

  return <PosThemeScope className="min-h-dvh px-4 py-8">{body}</PosThemeScope>
}

function Header({ info, subtitle }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-(--brand-primary) text-(--brand-primary-foreground)"><Store className="h-8 w-8" aria-hidden="true" /></span>
      <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{info.companyName}</p>
      <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{info.outletName ? `${info.outletName} · ` : ''}{info.terminalName ?? info.name}</h1>
      {subtitle && <p className="max-w-xs text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p>}
    </div>
  )
}

function PairingCard({ link, info, onPaired }) {
  const pendingKey = `runly-pos-pairing:${link}`
  const [pending, setPending] = useState(() => read(sessionStorage, pendingKey))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!pending) return
    let stop = false
    const tick = async () => {
      try {
        const status = (await runly.pos.device.pairStatus(link, pending.pollSecret)).data
        if (stop) return
        if (status.status === 'paired') { write(sessionStorage, pendingKey, null); onPaired(status.deviceToken); return }
        if (status.status === 'expired') { write(sessionStorage, pendingKey, null); setPending(null); setError('El código expiró. Genera otro.'); return }
      } catch { /* keep polling: transient network errors */ }
      if (!stop) timer = setTimeout(tick, 3000)
    }
    let timer = setTimeout(tick, 1500)
    return () => { stop = true; clearTimeout(timer) }
  }, [pending, link, pendingKey, onPaired])

  async function start() {
    setBusy(true); setError('')
    try {
      const next = (await runly.pos.device.pair(link, navigator.userAgent.includes('Mobile') ? 'Celular' : 'Equipo de mostrador')).data
      write(sessionStorage, pendingKey, next)
      setPending(next)
    } catch (e) {
      setError(e?.message ?? 'No se pudo emparejar.')
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm sm:p-8">
      <Header info={info} subtitle={pending ? 'Pide a un administrador que escriba este código en Administración > Cajas y pagos > Acceso por enlace.' : 'Este dispositivo todavía no está autorizado para usar la caja.'} />
      {pending ? (
        <>
          <p className="text-center text-5xl font-extrabold tracking-[0.3em] tabular-nums text-[hsl(var(--foreground))]" aria-label={`Código ${pending.code.split('').join(' ')}`}>{pending.code}</p>
          <p className="text-center text-sm text-[hsl(var(--muted-foreground))]" aria-live="polite">Esperando aprobación...</p>
        </>
      ) : (
        <Button size="lg" className="h-14 text-base font-bold" onClick={start} loading={busy}>Autorizar este dispositivo</Button>
      )}
      {error && <p role="alert" className="text-center text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
    </div>
  )
}

function PinPad({ link, info, deviceToken, onSignIn, onDeviceRejected }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async (value) => {
    if (value.length < 4 || busy) return
    setBusy(true); setError('')
    try {
      onSignIn((await runly.pos.device.operator(link, deviceToken, value)).data)
    } catch (e) {
      setPin('')
      if (e?.details?.code === 'DEVICE_UNAUTHORIZED') { onDeviceRejected(); return }
      setError(e?.message ?? 'No se pudo entrar.')
    } finally { setBusy(false) }
  }, [busy, link, deviceToken, onSignIn, onDeviceRejected])

  const press = useCallback((key) => {
    if (busy) return
    setError('')
    if (key === 'del') setPin((p) => p.slice(0, -1))
    else if (key === 'ok') submit(pin)
    else setPin((p) => (p.length < 6 ? p + key : p))
  }, [busy, pin, submit])

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('del')
      else if (e.key === 'Enter') press('ok')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm sm:p-8">
      <Header info={info} subtitle="Escribe tu PIN de cajero." />
      <div className="flex justify-center gap-3" aria-label={`${pin.length} dígitos escritos`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span key={i} className={cn('h-4 w-4 rounded-sm border-2', i < pin.length ? 'border-(--brand-primary) bg-(--brand-primary)' : 'border-[hsl(var(--input))]')} />
        ))}
      </div>
      {error && <p role="alert" className="text-center text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={busy || (key === 'ok' && pin.length < 4)}
            aria-label={key === 'del' ? 'Borrar' : key === 'ok' ? 'Entrar' : key}
            className={cn(
              'flex h-16 items-center justify-center rounded-2xl text-2xl font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:bg-[hsl(var(--muted))] disabled:text-[hsl(var(--muted-foreground))]',
              key === 'ok' ? 'bg-(--brand-primary) text-(--brand-primary-foreground)' : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/70 active:scale-95',
            )}
          >
            {key === 'del' ? <Delete className="h-6 w-6" aria-hidden="true" /> : key === 'ok' ? <LogIn className="h-6 w-6" aria-hidden="true" /> : key}
          </button>
        ))}
      </div>
    </div>
  )
}

// The regular register with the cashier's session and company provided here.
function DeviceRegister({ operator, onSignOut }) {
  const queryClient = useQueryClient()
  const { companyId, profile, operatorToken } = operator
  // Before the first render: every request must carry this company.
  useMemo(() => {
    setActiveCompanyId(companyId)
    write(localStorage, selectionKey(profile.id, companyId), { outletId: operator.outletId, terminalId: operator.terminalId })
  }, [companyId, profile.id, operator.outletId, operator.terminalId])

  // Expired or revoked session: back to the PIN pad.
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => { if (event?.query?.state?.error?.status === 401) onSignOut() })
    const timer = setTimeout(onSignOut, Math.max(0, Date.parse(operator.expiresAt) - Date.now()))
    return () => { unsubscribe(); clearTimeout(timer) }
  }, [queryClient, onSignOut, operator.expiresAt])

  const auth = useMemo(() => ({
    session: { access_token: operatorToken },
    user: null,
    userProfile: { ...profile, isAdmin: false, permissions: [] },
    loading: false,
  }), [operatorToken, profile])
  const company = useMemo(() => ({ activeCompanyId: companyId, companies: [], setActiveCompany: () => {}, getActiveCompanyId: () => companyId }), [companyId])

  return (
    <AuthContext.Provider value={auth}>
      <ActiveCompanyContext.Provider value={company}>
        <PosThemeScope className="h-dvh">
          <RetailCajaView key={`${profile.id}:${companyId}`} device={{ onSignOut }} />
        </PosThemeScope>
      </ActiveCompanyContext.Provider>
    </AuthContext.Provider>
  )
}
