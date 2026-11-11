// Import an automation from the Marketplace (E3a): choose a release -> risk report (inspect,
// nothing saved) -> consent on the cleaned definition and the exact services (prepare) ->
// confirm -> paused automation. Everything is decided by the server; this dialog never
// activates the automation and never saves it through the regular editor endpoint.
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, WizardSteps } from '@runly/ui'
import { AlertTriangle, CheckCircle2, Globe, Info, Loader2, Mail, PauseCircle, ShieldAlert, Store, Trash2, Wrench, XCircle } from 'lucide-react'
import { runly } from '../../../lib/runly'
import { MarketplaceResourcePicker, MarketplaceState } from '../../../components/marketplace/MarketplaceResourcePicker.jsx'
import { compatibilityLabel, isTerminal, marketplaceError, publisherLabel, releaseRef } from '../../../lib/marketplace-import.js'
import { consentFor, riskSections, stepSummary } from '../lib/marketplaceRisk.js'

const unwrap = (response) => response?.data ?? response
const STEPS = [{ key: 'choose', label: 'Elegir' }, { key: 'review', label: 'Riesgos' }, { key: 'consent', label: 'Consentimiento' }, { key: 'done', label: 'Resultado' }]
const BUSY = { inspecting: 'Descargando y verificando en el servidor…', preparing: 'Preparando la automatización…', confirming: 'Importando…' }

function Block({ icon: Icon, title, tone, children }) {
  const color = tone === 'danger' ? 'text-red-700 dark:text-red-300' : tone === 'warning' ? 'text-amber-800 dark:text-amber-200' : 'text-[hsl(var(--muted-foreground))]'
  return (
    <section aria-label={title} className="space-y-1.5">
      <h3 className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${color}`}><Icon className="h-3.5 w-3.5" aria-hidden />{title}</h3>
      <div className="text-sm">{children}</div>
    </section>
  )
}

export function RiskReport({ report, definition }) {
  const risk = riskSections(report), steps = stepSummary(definition)
  return (
    <div className="space-y-4" data-risk-report>
      {risk.errors.length ? (
        <Block icon={XCircle} title="Impide importar" tone="danger">
          <ul className="space-y-1">{risk.errors.map((row, i) => <li key={i} className="break-words text-red-700 dark:text-red-300">{row.message}</li>)}</ul>
        </Block>
      ) : null}
      <dl className="grid gap-2 sm:grid-cols-3">
        {[['Disparador', risk.trigger], ['Bloques', steps.length], ['Al importar', 'Pausada']].map(([term, value]) => (
          <div key={term} className="rounded-lg bg-[hsl(var(--muted)/0.5)] px-3 py-2"><dt className="text-xs text-[hsl(var(--muted-foreground))]">{term}</dt><dd className="text-sm font-semibold">{value}</dd></div>
        ))}
      </dl>
      <Block icon={ShieldAlert} title={`Servicios que podrá usar (${risk.services.length})`}>
        {risk.services.length ? <ul className="flex flex-wrap gap-1.5">{risk.services.map((s) => <li key={s.key}><Badge variant="secondary" title={s.key}>{s.label}</Badge></li>)}</ul> : <p className="text-[hsl(var(--muted-foreground))]">No usa servicios de Runly.</p>}
      </Block>
      {risk.httpHosts.length ? (
        <Block icon={Globe} title="Destinos HTTP" tone="warning">
          <ul className="flex flex-wrap gap-1.5">{risk.httpHosts.map((host) => <li key={host}><Badge variant="outline">{host}</Badge></li>)}</ul>
          <p className="mt-1.5 text-amber-800 dark:text-amber-200">Estos pasos envían a otro sistema el contenido que escribió el autor. Runly no lo muestra aquí y no puede garantizar que no contenga datos sensibles: revísalo en el editor antes de activarla.</p>
        </Block>
      ) : null}
      {risk.externalEmails ? (
        <Block icon={Mail} title="Correos externos" tone="warning"><p>El archivo publicado enviaba correo a {risk.externalEmails} {risk.externalEmails === 1 ? 'dirección externa' : 'direcciones externas'}. Se quitaron antes de guardar nada.</p></Block>
      ) : null}
      {risk.removed.length ? (
        <Block icon={Trash2} title="Quitado antes de guardar"><p>{risk.removed.map((r) => r.text).join(', ')}. Las referencias a personas y datos de otra empresa no se importan.</p></Block>
      ) : null}
      {risk.flags.length ? <Block icon={Info} title="También"><ul className="list-inside list-disc">{risk.flags.map((f) => <li key={f}>{f}</li>)}</ul></Block> : null}
      {risk.pending.length ? (
        <Block icon={Wrench} title="Configuración pendiente"><ul className="space-y-0.5">{risk.pending.map((text, i) => <li key={i}>{text}</li>)}</ul><p className="mt-1 text-[hsl(var(--muted-foreground))]">Complétala en el editor antes de activarla.</p></Block>
      ) : null}
      {risk.notes.length ? <Block icon={Info} title="Notas"><ul className="space-y-0.5">{risk.notes.map((n) => <li key={n.code}>{n.message}</li>)}</ul></Block> : null}
      {steps.length ? (
        <Block icon={Info} title="Bloques">
          <ol className="space-y-0.5">{steps.map((s) => <li key={s.key} className="flex items-center gap-1.5">{s.http ? <Globe className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" aria-label="Llama a otro sistema" /> : null}{s.text}</li>)}</ol>
        </Block>
      ) : null}
    </div>
  )
}

function ResourceLine({ resource }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--border))] p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-(--brand-primary)/10 text-(--brand-primary)"><Store className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{resource.title}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{publisherLabel(resource)} · v{resource.version}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5"><Badge variant="outline">{resource.license}</Badge><Badge variant="outline">{compatibilityLabel(resource)}</Badge>{resource.trust === 'resource' ? <Badge variant="outline" className="border-emerald-600/40 text-emerald-800 dark:border-emerald-400/40 dark:text-emerald-300">Firma verificada</Badge> : null}</div>
      </div>
    </div>
  )
}

export function MarketplaceAutomationDialog({ open, onOpenChange, token, onOpenAutomation, initialResource }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState('choose'), [busy, setBusy] = useState(null), [state, setState] = useState(null)
  const [resource, setResource] = useState(null), [acknowledged, setAcknowledged] = useState(false)
  const [inspection, setInspection] = useState(null), [prepared, setPrepared] = useState(null), [result, setResult] = useState(null)
  const [servicesAccepted, setServicesAccepted] = useState(false), [risksAccepted, setRisksAccepted] = useState(false)
  const pending = useRef(null), confirming = useRef(false)
  // Bumped on close, restart and unmount: an answer that arrives later belongs to a dialog that no longer exists.
  const generation = useRef(0)

  // An unconfirmed preparation is released when the dialog closes or the person starts over.
  const cancelPrepared = (id) => { if (id) runly.modules.cancelMarketplaceAutomationImport(id, token).catch(() => {}) }
  const release = () => { generation.current += 1; const id = pending.current; pending.current = null; cancelPrepared(id) }
  const restart = () => { release(); setStep('choose'); setBusy(null); setState(null); setInspection(null); setPrepared(null); setResult(null); setServicesAccepted(false); setRisksAccepted(false) }
  useEffect(() => { if (!open) { restart(); setResource(null); setAcknowledged(false) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && initialResource) setResource(initialResource) }, [open, initialResource])
  useEffect(() => () => release(), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(kind, task) {
    setBusy(kind); setState(null)
    try { await task() } catch (error) { return marketplaceError(error) } finally { setBusy(null) }
    return null
  }
  async function inspect() {
    const started = generation.current
    const failed = await run('inspecting', async () => {
      const data = unwrap(await runly.modules.inspectMarketplaceAutomation(releaseRef(resource, acknowledged), token))
      if (started !== generation.current) return
      setInspection(data); setStep('review')
    })
    if (failed && started === generation.current) { setState(failed); setStep('choose') }
  }
  async function prepare() {
    const started = generation.current
    const failed = await run('preparing', async () => {
      const data = unwrap(await runly.modules.prepareMarketplaceAutomationImport(releaseRef(resource, acknowledged), token))
      // Closed or restarted while the server was preparing: release it at once instead of leaving it to expire.
      if (started !== generation.current) { cancelPrepared(data.id); return }
      pending.current = data.id; setPrepared(data); setServicesAccepted(false); setRisksAccepted(false); setStep('consent')
    })
    if (failed && started === generation.current) {
      if (failed.details?.report) setInspection((current) => ({ ...current, report: failed.details.report, blocked: true }))
      setState(failed)
    }
  }
  async function confirm() {
    if (confirming.current || !prepared) return
    confirming.current = true
    const failed = await run('confirming', async () => {
      const data = unwrap(await runly.modules.confirmMarketplaceAutomationImport(prepared.id, consentFor(prepared), token))
      pending.current = null; setResult(data); setStep('done')
      queryClient.invalidateQueries({ queryKey: ['system-automations'] })
    })
    confirming.current = false
    if (!failed) return
    // Revoked/withdrawn/blocked or a stale preparation: the server already cancelled it; start again.
    if (isTerminal(failed) || failed.kind === 'prepare_expired') { pending.current = null; setPrepared(null); setStep(isTerminal(failed) ? 'blocked' : 'review') }
    setState(failed)
  }

  const services = prepared?.services ?? [], blocked = Boolean(inspection?.blocked)
  const canConfirm = step === 'consent' && !busy && risksAccepted && (services.length === 0 || servicesAccepted)
  const retry = state?.retryable ? ({ choose: inspect, review: prepare, consent: confirm })[step] : null
  const wizard = step === 'blocked' ? 'review' : step

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && busy === 'confirming') return; onOpenChange(next) }}>
      <DialogContent size="2xl" className="flex max-h-[90dvh] flex-col">
        <DialogHeader icon={Store}>
          <DialogTitle>Importar desde Marketplace</DialogTitle>
          <DialogDescription>Runly descarga y verifica la automatización. Se importa pausada y no hace nada hasta que tú la actives.</DialogDescription>
        </DialogHeader>
        <WizardSteps steps={STEPS} current={wizard} />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-busy={Boolean(busy)}>
          {state ? <MarketplaceState state={state} onRetry={retry} /> : null}
          {step === 'choose' ? <MarketplaceResourcePicker type="automation" token={token} value={resource} onChange={(next) => { setResource(next); setState(null) }} acknowledged={acknowledged} onAcknowledge={setAcknowledged} disabled={Boolean(busy)} /> : null}
          {step === 'blocked' ? <p role="status" className="rounded-lg border border-[hsl(var(--border))] p-4 text-sm">No se importó nada y la preparación se descartó. Elige otra automatización.</p> : null}
          {(step === 'review' || step === 'consent') && inspection ? (
            <>
              <ResourceLine resource={inspection.resource ?? resource} />
              <RiskReport report={(prepared ?? inspection).report} definition={(prepared ?? inspection).definition} />
            </>
          ) : null}
          {step === 'consent' && prepared ? (
            <section aria-label="Consentimiento" className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
              {services.length ? (
                <CheckboxField checked={servicesAccepted} disabled={Boolean(busy)} onChange={(e) => setServicesAccepted(e.target.checked)}
                  label={`Autorizo que esta automatización use ${services.length === 1 ? 'este servicio' : `estos ${services.length} servicios`} en la empresa: ${riskSections(prepared.report).services.map((s) => s.label).join(', ')}.`} />
              ) : null}
              <CheckboxField checked={risksAccepted} disabled={Boolean(busy)} onChange={(e) => setRisksAccepted(e.target.checked)}
                label="Revisé los riesgos. Entiendo que se importa pausada, que debo completar y revisar sus bloques antes de activarla y que Runly no garantiza que el contenido de los pasos HTTP no tenga datos sensibles." />
            </section>
          ) : null}
          {step === 'done' && result ? (
            <div role="status" className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-4" data-import-result>
              <p className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />Automatización importada — Pausada</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">«{result.label}» está pausada: no se ejecuta, no escucha eventos ni tiene URL de webhook hasta que la actives desde su editor.</p>
              <div className="flex flex-wrap gap-1.5"><Badge variant="outline"><PauseCircle className="mr-1 h-3.5 w-3.5" aria-hidden />Pausada</Badge><Badge variant="outline">{result.key}</Badge></div>
            </div>
          ) : null}
          {busy ? <p role="status" className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{BUSY[busy]}</p> : null}
          {step === 'review' && blocked ? <p className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300"><AlertTriangle className="h-4 w-4" aria-hidden />Corrige lo que impide importar (por ejemplo, agrega el destino HTTP permitido) y vuelve a revisarla.</p> : null}
        </div>
        <DialogFooter>
          {step === 'done' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
              <Button onClick={() => onOpenAutomation?.(result)}>Abrir en el editor</Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy === 'confirming'} onClick={() => onOpenChange(false)}>Cancelar</Button>
              {step !== 'choose' ? <Button variant="ghost" disabled={busy === 'confirming'} onClick={restart}>Elegir otra</Button> : null}
              {step === 'choose' ? <Button disabled={!resource || Boolean(busy)} onClick={inspect}>Revisar riesgos</Button> : null}
              {step === 'review' ? <Button disabled={blocked || Boolean(busy)} onClick={prepare}>Continuar</Button> : null}
              {step === 'consent' ? <Button disabled={!canConfirm} onClick={confirm}>Importar pausada</Button> : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
