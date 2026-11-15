import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, StatusPill, TextField } from '@runly/ui'
import { AlertTriangle, CheckCircle2, Copy, Globe, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { describeError } from '../lib/websiteErrors.js'

export const HTTPS_STATUS = {
  ok: { label: 'HTTPS listo', tone: 'success', icon: ShieldCheck },
  invalid: { label: 'Certificado no válido', tone: 'danger', icon: AlertTriangle },
  unreachable: { label: 'HTTPS sin configurar', tone: 'warning', icon: AlertTriangle },
  unknown: { label: 'HTTPS sin comprobar', tone: 'neutral', icon: Globe },
}

function CopyValue({ label, value }) {
  const copy = () => navigator.clipboard.writeText(value).then(() => toast.success('Copiado')).catch(() => toast.error('Selecciona el texto y cópialo manualmente'))
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-1.5 text-xs">{value}</code>
        <Button type="button" variant="outline" size="icon" aria-label={`Copiar ${label}`} onClick={copy}><Copy className="h-4 w-4" aria-hidden /></Button>
      </div>
    </div>
  )
}

function RecordCard({ record }) {
  return (
    <li className="space-y-2.5 rounded-lg border border-[hsl(var(--border))] p-3">
      <StatusPill size="sm" tone="neutral">Registro {record.type}</StatusPill>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <CopyValue label="Nombre (host)" value={record.name} />
        <CopyValue label="Valor" value={record.value} />
      </div>
      {record.note && <p className="text-xs text-[hsl(var(--muted-foreground))]">{record.note}</p>}
    </li>
  )
}

// Add a customer-owned domain: type it, create the DNS records the instance shows, verify, see HTTPS status.
// `initial` reopens an existing pending/verified domain. Everything the server decides is shown as it answers.
export function AddCustomDomainDialog({ open, onOpenChange, api, siteId, initial, onChanged }) {
  const [hostname, setHostname] = useState('')
  const [domain, setDomain] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setDomain(initial ?? null)
    setHostname('')
    setError(null)
  }, [open, initial])

  async function run(action) {
    setBusy(true); setError(null)
    try {
      const response = await action()
      setDomain(response.data)
      onChanged?.()
    } catch (err) { setError(err) } finally { setBusy(false) }
  }

  const info = error ? describeError(error) : null
  const https = HTTPS_STATUS[domain?.httpsState] ?? HTTPS_STATUS.unknown
  const HttpsIcon = https.icon

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent size="lg">
        <DialogHeader icon={Globe} tone="info">
          <DialogTitle>{domain ? domain.hostname : 'Conectar un dominio propio'}</DialogTitle>
          <DialogDescription>
            {!domain && 'Usa un dominio que ya sea tuyo, por ejemplo www.mitienda.mx.'}
            {domain?.state === 'pending' && 'Crea estos registros en el panel de DNS de tu proveedor de dominio y luego verifica.'}
            {domain?.state === 'assigned' && 'La propiedad del dominio está verificada.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {!domain && (
            <TextField
              label="Dominio"
              value={hostname}
              onChange={(e) => { setHostname(e.target.value); setError(null) }}
              placeholder="www.mitienda.mx"
              hint="Sin https:// ni rutas. Si es el dominio sin «www», tu proveedor debe permitir ALIAS o un registro A."
              autoFocus
            />
          )}

          {domain?.state === 'pending' && (
            <>
              <ul className="space-y-3">{domain.dnsRecords.map((record) => <RecordCard key={`${record.type}-${record.name}`} record={record} />)}</ul>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Los cambios de DNS pueden tardar unos minutos (a veces más) en propagarse. Puedes cerrar esta ventana y volver a verificar después.</p>
              {domain.lastError && (
                <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{domain.lastError}
                </p>
              )}
            </>
          )}

          {domain?.state === 'assigned' && (
            <>
              <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Tu sitio ya responde en {domain.hostname}.
              </p>
              {domain.pointsHere === false && (
                <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />El DNS de este dominio todavía no apunta a esta instalación. Revisa el registro de abajo.
                </p>
              )}
              {domain.dnsRecords.length > 0 && <ul className="space-y-3">{domain.dnsRecords.map((record) => <RecordCard key={`${record.type}-${record.name}`} record={record} />)}</ul>}
              <div className="space-y-2 rounded-lg border border-[hsl(var(--border))] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusPill tone={https.tone} size="sm" icon={HttpsIcon}>{https.label}</StatusPill>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => api.checkCustomDomainHttps(siteId, domain.hostname))}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}Comprobar HTTPS
                  </Button>
                </div>
                {domain.httpsState !== 'ok' && (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Para que el sitio abra con https://, quien administra tu instalación debe tener un certificado para este dominio. Runly solo lo comprueba; no lo emite.</p>
                )}
              </div>
            </>
          )}

          {info && <p role="alert" className="rounded-lg bg-[hsl(var(--destructive))]/10 p-3 text-sm text-[hsl(var(--destructive))]"><strong>{info.title}.</strong> {info.message}</p>}
        </div>

        <DialogFooter>
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
