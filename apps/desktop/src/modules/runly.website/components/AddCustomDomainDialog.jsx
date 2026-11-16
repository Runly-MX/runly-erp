import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, StatusPill, TextField } from '@runly/ui'
import { AlertTriangle, CheckCircle2, Copy, Globe, Info, Loader2, Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { describeError } from '../lib/websiteErrors.js'
import { DomainHelp } from './DomainHelp.jsx'

export const HTTPS_STATUS = {
  ok: { label: 'HTTPS listo', tone: 'success', icon: ShieldCheck },
  invalid: { label: 'Certificado no válido', tone: 'danger', icon: AlertTriangle },
  unreachable: { label: 'HTTPS sin configurar', tone: 'warning', icon: AlertTriangle },
  unknown: { label: 'HTTPS sin comprobar', tone: 'neutral', icon: Globe },
}

const PURPOSE = {
  TXT: 'Demuestra que el dominio es tuyo',
  A: 'Dirige el dominio a tu sitio',
  AAAA: 'Dirige el dominio a tu sitio (IPv6)',
  CNAME: 'Dirige el dominio a tu sitio',
  ALIAS: 'Dirige el dominio a tu sitio',
}

const copy = (value) => navigator.clipboard.writeText(value).then(() => toast.success('Copiado')).catch(() => toast.error('Selecciona el texto y cópialo manualmente'))

// One copyable value: single line, truncated with the full text on hover; the copy button always carries the whole value.
function Field({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
      <div className="flex h-9 items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 pl-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px]" title={value}>{value}</code>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Copiar ${label.toLowerCase()}`} onClick={() => copy(value)}><Copy className="h-3.5 w-3.5" aria-hidden /></Button>
      </div>
      {hint && <p className="mt-1 truncate text-[11px] text-[hsl(var(--muted-foreground))]" title={hint}>{hint}</p>}
    </div>
  )
}

function RecordRow({ record, index }) {
  const host = record.host ?? record.name
  return (
    <li className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[hsl(var(--muted))] text-xs font-semibold tabular-nums">{index + 1}</span>
        <StatusPill size="sm" tone="neutral">{record.type}</StatusPill>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">{PURPOSE[record.type] ?? 'Registro DNS'}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Field label="Host / nombre" value={host} hint={host !== record.name ? `Nombre completo: ${record.name}` : undefined} />
        <Field label="Valor / apunta a" value={record.value} />
      </div>
      {record.note && <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">{record.note}</p>}
    </li>
  )
}

function Notice({ tone = 'info', icon: Icon = Info, children }) {
  const tones = {
    info: 'border-sky-500/25 bg-sky-500/5 text-[hsl(var(--foreground))]',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  }
  return (
    <div role="status" className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${tones[tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-2">{children}</div>
    </div>
  )
}

// The other common form of the same domain: www.x.mx <-> x.mx. Each is a separate hostname with its own records.
function companionOf(domain) {
  if (!domain?.zone) return null
  if (domain.hostname === domain.zone) return `www.${domain.zone}`
  if (domain.hostname === `www.${domain.zone}`) return domain.zone
  return null
}

// Add a customer-owned domain: type it, create the DNS records the instance shows, verify, see HTTPS status.
// `initial` reopens an existing pending/verified domain. Everything the server decides is shown as it answers.
export function AddCustomDomainDialog({ open, onOpenChange, api, siteId, initial, onChanged }) {
  const [hostname, setHostname] = useState('')
  const [domain, setDomain] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [companionAdded, setCompanionAdded] = useState(false)

  useEffect(() => {
    if (!open) return
    setDomain(initial ?? null)
    setHostname('')
    setError(null)
    setCompanionAdded(false)
  }, [open, initial])

  async function run(action) {
    setBusy(true); setError(null)
    try {
      const response = await action()
      setDomain(response.data)
      onChanged?.()
    } catch (err) { setError(err) } finally { setBusy(false) }
  }
  async function addCompanion(name) {
    setBusy(true); setError(null)
    try {
      await api.addCustomDomain(siteId, name)
      setCompanionAdded(true)
      onChanged?.()
      toast.success(`${name} agregado. Abre sus instrucciones desde la lista de dominios propios.`)
    } catch (err) { setError(err) } finally { setBusy(false) }
  }

  const info = error ? describeError(error) : null
  const https = HTTPS_STATUS[domain?.httpsState] ?? HTTPS_STATUS.unknown
  const HttpsIcon = https.icon
  const companion = companionOf(domain)
  const records = domain?.dnsRecords ?? []

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent size="xl" className="flex max-h-[88dvh] flex-col">
        <DialogHeader icon={Globe} tone="info">
          <DialogTitle className="break-all">{domain ? domain.hostname : 'Conectar un dominio propio'}</DialogTitle>
          <DialogDescription>
            {!domain && 'Usa un dominio que ya sea tuyo, por ejemplo www.mitienda.mx.'}
            {domain?.state === 'pending' && `Configura el DNS de ${domain.zone ?? 'tu dominio'} en el panel de tu proveedor (IONOS, GoDaddy, Cloudflare…) y después verifica.`}
            {domain?.state === 'assigned' && 'La propiedad del dominio está verificada.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {!domain && (
            <TextField
              label="Dominio"
              value={hostname}
              onChange={(e) => { setHostname(e.target.value); setError(null) }}
              placeholder="www.mitienda.mx"
              hint="Sin https:// ni rutas. www.mitienda.mx y mitienda.mx son direcciones distintas: puedes conectar las dos."
              autoFocus
            />
          )}
          {!domain && <DomainHelp zone={hostname.trim().replace(/^www\./, '') || undefined} />}

          {domain?.state === 'pending' && (
            <>
              <ol className="space-y-3">{records.map((record, i) => <RecordRow key={`${record.type}-${record.name}`} record={record} index={i} />)}</ol>
              <Notice>
                <p>En el campo <strong>Host</strong> escribe solo la parte que se muestra ({records.map((r) => <code key={r.name} className="mx-0.5 rounded bg-[hsl(var(--muted))] px-1 font-mono text-xs">{r.host ?? r.name}</code>)}); el proveedor agrega «{domain.zone}» por su cuenta. Si tu panel pide el nombre completo, usa el que aparece debajo.</p>
                <p className="text-[hsl(var(--muted-foreground))]">Los cambios de DNS suelen tardar unos minutos (a veces horas). Puedes cerrar esta ventana y verificar después.</p>
              </Notice>
              {domain.lastError && <Notice tone="warning" icon={AlertTriangle}><p>{domain.lastError}</p></Notice>}
              <DomainHelp zone={domain.zone} />
            </>
          )}

          {domain?.state === 'assigned' && (
            <>
              <Notice tone="success" icon={CheckCircle2}><p className="font-medium">Tu sitio ya responde en {domain.hostname}.</p></Notice>
              {domain.pointsHere === false && <Notice tone="warning" icon={AlertTriangle}><p>El DNS de este dominio todavía no apunta a esta instalación. Revisa el registro de abajo.</p></Notice>}
              {records.length > 0 && <ol className="space-y-3">{records.map((record, i) => <RecordRow key={`${record.type}-${record.name}`} record={record} index={i} />)}</ol>}
              <div className="space-y-2 rounded-lg border border-[hsl(var(--border))] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusPill tone={https.tone} size="sm" icon={HttpsIcon}>{https.label}</StatusPill>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => api.checkCustomDomainHttps(siteId, domain.hostname))}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}Comprobar HTTPS
                  </Button>
                </div>
                {domain.httpsState !== 'ok' && <p className="text-xs text-[hsl(var(--muted-foreground))]">Para que el sitio abra con https://, quien administra tu instalación debe tener un certificado para este dominio. Runly solo lo comprueba; no lo emite.</p>}
              </div>
            </>
          )}

          {companion && domain?.state !== 'released' && (
            <Notice>
              <p>Esto conecta solo <strong>{domain.hostname}</strong>. Quien escriba <strong>{companion}</strong> no llegará a tu sitio a menos que también lo conectes.</p>
              <p className="text-[hsl(var(--muted-foreground))]">Conéctalo también y, en Dominios, elige cuál es la dirección principal: la otra redirigirá a ella.</p>
              {!companionAdded && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => addCompanion(companion)}><Plus className="h-3.5 w-3.5" aria-hidden />Conectar también {companion}</Button>
              )}
            </Notice>
          )}

          {info && <Notice tone="warning" icon={AlertTriangle}><p><strong>{info.title}.</strong> {info.message}</p></Notice>}
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cerrar</Button>
          {!domain && (
            <Button type="button" disabled={busy || hostname.trim().length < 3} onClick={() => run(() => api.addCustomDomain(siteId, hostname))}>
              {busy ? 'Continuando…' : 'Continuar'}
            </Button>
          )}
          {domain?.state === 'pending' && (
            <Button type="button" disabled={busy} onClick={() => run(() => api.verifyCustomDomain(siteId, domain.hostname))}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}Verificar ahora
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
