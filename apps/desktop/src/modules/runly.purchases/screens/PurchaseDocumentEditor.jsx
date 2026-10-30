import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { AlertTriangle, Lock, RefreshCw, Save, Send } from 'lucide-react'
import { AttachmentsPanel, Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, TextareaField, FormSkeleton } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider.jsx'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { attachmentsConfig } from '../lib/attachments.js'
import { errorText, policyReasons, useCapabilities, useDocument, useNextNumber, usePurchasesCan, useSaveDocument, useTransition } from '../hooks/usePurchases.js'
import { usePurchaseRoute } from '../hooks/usePurchaseRoute.js'
import { SCHEMAS, defaultsFor, toPayload } from '../lib/document-schema.js'
import { lineFromApi } from '../lib/document-math.js'
import { KINDS, ROOT } from '../lib/purchases-constants.js'
import { MainFields, TermsFields } from '../components/editor/HeaderFields.jsx'
import { LineItemsEditor } from '../components/editor/LineItemsEditor.jsx'
import { TotalsCard } from '../components/editor/TotalsCard.jsx'
import { LinkedInventoryCard } from '../components/editor/LinkedInventoryCard.jsx'
import { LinkedOrdersField } from '../components/editor/LinkedOrdersField.jsx'

const EDITABLE = ['orders', 'invoices', 'requests']

function Section({ id, title, description, children }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-24 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 md:p-5">
      <header className="mb-4">
        <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
      </header>
      {children}
    </section>
  )
}

// Field -> [label, section] for the error summary shown when saving fails.
const FIELD_PLACE = {
  supplierId: ['Proveedor', 'section-main'], number: ['Folio', 'section-main'], issueDate: ['Fecha', 'section-main'], title: ['Qué se necesita', 'section-main'],
  currency: ['Moneda', 'section-main'], expectedDate: ['Entrega esperada', 'section-terms'], dueDate: ['Vencimiento', 'section-terms'],
  fiscalUuid: ['UUID fiscal', 'section-terms'], neededBy: ['Se necesita para', 'section-terms'], lines: ['Partidas', 'section-lines'],
}
const LINE_FIELD = { quantity: 'cantidad', unitAmount: 'precio', description: 'concepto' }

// react-hook-form errors -> [{ key, text, section }] in screen order.
function errorList(errors) {
  const out = []
  for (const [field, error] of Object.entries(errors ?? {})) {
    const [label, section] = FIELD_PLACE[field] ?? [field, 'section-main']
    if (field === 'lines' && Array.isArray(error)) {
      error.forEach((line, index) => Object.entries(line ?? {}).forEach(([key, e]) => out.push({ key: `lines.${index}.${key}`, text: `Partida ${index + 1}, ${LINE_FIELD[key] ?? key}: ${e?.message}`, section })))
      if (error.root?.message) out.push({ key: 'lines.root', text: `${label}: ${error.root.message}`, section })
    } else if (error?.message) out.push({ key: field, text: `${label}: ${error.message}`, section })
  }
  const order = ['section-main', 'section-lines', 'section-terms']
  return out.sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section))
}
const isStale = (error) => error?.details?.code === 'STALE_DOCUMENT' || (error?.status === 409 && /cambió/i.test(error?.message ?? ''))

function policyMessage(error, fallback) {
  const reasons = policyReasons(error)
  if (reasons.length) return `${fallback}: ${reasons.map((r) => r.reason ?? r).join('; ')}`
  return errorText(error, fallback)
}

// Full-page editor for orders, invoices and requests. Accepts
// ?inventoryId= (repeatable), ?orderId= (invoices) and ?caseId=.
export default function PurchaseDocumentEditor() {
  const navigate = useNavigate()
  const { section, id, isEdit, searchParams } = usePurchaseRoute()
  const kind = EDITABLE.includes(section) ? section : 'orders'
  const meta = KINDS[kind]
  const caps = useCapabilities()
  const can = usePurchasesCan()
  const existing = useDocument(kind, isEdit ? id : null)
  const orderId = kind === 'invoices' && !isEdit ? searchParams.get('orderId') : null
  const sourceOrder = useDocument('orders', orderId)
  const urlInventoryIds = useMemo(() => [...new Set(searchParams.getAll('inventoryId').filter(Boolean))], [searchParams])

  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  // New documents stage files locally; they upload once the draft exists.
  const attachments = useRef(null)
  const save = useSaveDocument(kind)
  const transition = useTransition(kind, id)
  const [supplier, setSupplier] = useState(null)
  const [knownItems, setKnownItems] = useState({})
  // Error summary after a failed save, the conflict banner (someone else saved
  // the draft) and the discard confirmations.
  const [invalid, setInvalid] = useState([])
  const [conflict, setConflict] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const summaryRef = useRef(null)
  const conflictRef = useRef(null)
  const form = useForm({
    resolver: zodResolver(SCHEMAS[kind]),
    defaultValues: defaultsFor(kind, { inventoryIds: urlInventoryIds, caseId: searchParams.get('caseId') }),
  })
  const { control, handleSubmit, reset, getValues, setValue, formState: { errors, isDirty } } = form
  const lines = useWatch({ control, name: 'lines' })
  const currency = useWatch({ control, name: 'currency' })
  const supplierId = useWatch({ control, name: 'supplierId' })
  const inheritItems = useWatch({ control, name: 'inheritItems' })
  const issueDate = useWatch({ control, name: 'issueDate' })
  // Invoices carry the supplier folio; orders and requests get a suggestion.
  const suggested = useNextNumber(kind, issueDate || undefined, !isEdit && kind !== 'invoices')
  const folio = isEdit ? { sequence: existing.data?.sequence } : suggested.data

  // Load the draft being edited, or prefill an invoice from its order, once.
  const loaded = useRef(false)
  // Version the form was loaded from; the API answers 409 STALE_DOCUMENT if
  // someone else saved the draft in between (a refetch must not move it).
  const loadedVersion = useRef(null)
  useEffect(() => {
    if (loaded.current) return
    if (isEdit && existing.data) {
      reset(defaultsFor(kind, { doc: existing.data }))
      loadedVersion.current = existing.data.updatedAt ?? null
      setSupplier(existing.data.supplier ?? null)
      loaded.current = true
    } else if (orderId && sourceOrder.data) {
      const order = sourceOrder.data
      reset({
        ...defaultsFor(kind, { inventoryIds: urlInventoryIds, caseId: order.caseId }),
        supplierId: order.supplierId ?? null,
        currency: order.currency ?? 'MXN',
        lines: (order.lines ?? []).map(({ id: _omit, ...line }) => lineFromApi(line)),
        orderIds: [order.id],
      })
      setSupplier(order.supplier ?? null)
      loaded.current = true
    }
  }, [isEdit, existing.data, orderId, sourceOrder.data, kind, reset, urlInventoryIds])

  const backTo = isEdit ? `${ROOT}/${kind}/${id}` : `${ROOT}/${kind}`
  const submit = (andSubmit) => handleSubmit(async (values) => {
    let saved
    try {
      const data = toPayload(kind, values, { isEdit })
      if (isEdit && loadedVersion.current) data.expectedUpdatedAt = loadedVersion.current
      saved = await save.mutateAsync({ id: isEdit ? id : null, data })
    } catch (error) {
      if (isEdit && isStale(error)) {
        setConflict(true)
        requestAnimationFrame(() => { conflictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); conflictRef.current?.focus({ preventScroll: true }) })
      }
      toast.error(policyMessage(error, 'No se pudo guardar'))
      return
    }
    setInvalid([])
    const targetId = saved?.id ?? id
    if (!isEdit && targetId && attachments.current?.pendingItems?.length) {
      const upload = await attachments.current.flushPending(targetId)
      if (!upload?.ok) toast.error('El documento se guardó, pero algunos archivos no se pudieron subir. Súbelos desde el detalle.')
    }
    if (andSubmit && targetId) {
      try {
        await transition.mutateAsync({ action: 'submit', targetId })
        toast.success(`${meta.short} enviada`)
      } catch (error) {
        toast.error(policyMessage(error, 'Se guardó como borrador, pero no se pudo enviar'))
      }
    } else {
      toast.success(isEdit ? 'Cambios guardados' : `${meta.short} guardada como borrador`)
    }
    navigate(`${ROOT}/${kind}/${targetId}`, { replace: true })
  }, (errs) => {
    const list = errorList(errs)
    setInvalid(list)
    toast.error('Revisa los campos marcados')
    requestAnimationFrame(() => summaryRef.current?.focus())
  })

  const goTo = (sectionId) => {
    const section = document.getElementById(sectionId)
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    section?.querySelector('[aria-invalid="true"], input, button, textarea')?.focus({ preventScroll: true })
  }
  // Reloads the draft as saved by someone else; the form's changes are dropped.
  const reloadDraft = async () => {
    const fresh = await existing.refetch()
    if (fresh.data) {
      reset(defaultsFor(kind, { doc: fresh.data }))
      loadedVersion.current = fresh.data.updatedAt ?? null
      setSupplier(fresh.data.supplier ?? null)
    }
    setConflict(false)
    setConfirm(null)
  }
  const leave = () => (isDirty ? setConfirm('discard') : navigate(backTo))

  const shell = (node) => <div className="min-h-dvh p-4 md:p-6">{node}</div>

  if (caps.isLoading || (isEdit && existing.isLoading) || (orderId && sourceOrder.isLoading)) return shell(<FormSkeleton sections={3} />)
  if (!caps.has(meta.capability)) {
    return shell(<EmptyState icon={meta.icon} title="Esta etapa no está activa" description="Tu flujo de compras no usa este tipo de documento." />)
  }
  if (!can(isEdit ? meta.update : meta.create)) {
    return shell(<EmptyState icon={Lock} title="Sin permiso" description="Tu rol no permite registrar este tipo de documento." />)
  }
  if (isEdit && existing.isError) return shell(<ErrorState title="No se pudo cargar el documento" onRetry={() => existing.refetch()} />)
  if (isEdit && existing.data && existing.data.status !== 'DRAFT') {
    // Registered documents are not edited freely: administrative data goes
    // through the audited correction (the API decides which fields).
    const correctable = existing.data.correction?.fields?.length && can(kind === 'orders' ? 'purchases.order.correct' : 'purchases.invoice.correct')
    return shell(
      <EmptyState icon={Lock} title="Este documento ya está registrado"
        description={correctable
          ? `Solo los borradores se editan. Puedes corregir con motivo: ${existing.data.correction.fields.map((f) => f.label.toLowerCase()).join(', ')}. Importes, partidas, proveedor y moneda no se corrigen: se cancela y se registra de nuevo.`
          : 'Solo los borradores se editan. Usa las acciones del detalle para avanzar o cancelar.'}
        action={correctable
          ? { label: 'Corregir datos', onClick: () => navigate(`${backTo}?accion=corregir`) }
          : { label: 'Ver detalle', onClick: () => navigate(backTo) }} />,
    )
  }

  const title = isEdit ? `Editar ${existing.data?.number ?? meta.short.toLowerCase()}` : meta.newLabel ?? `Nueva ${meta.short.toLowerCase()}`
  const showInventory = caps.has('inventoryRelations') && kind !== 'requests' && !isEdit
  const busy = save.isPending || transition.isPending

  return (
    <div className="min-h-dvh space-y-5 p-4 pb-24 md:p-6 md:pb-24">
      <PageHeader eyebrow={meta.singular} title={title} onBack={leave}
        description={kind === 'invoices' ? 'Captura la factura tal como la emitió tu proveedor.' : kind === 'requests' ? 'Describe lo que se necesita; se convertirá en orden al aprobarse.' : 'La orden se guarda como borrador hasta que la envíes.'} />

      {conflict ? (
        <div ref={conflictRef} tabIndex={-1} role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/[0.08] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Este borrador cambió mientras lo editabas</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Otra persona lo guardó. Tus cambios no se guardaron: recarga para ver la versión actual y vuelve a capturarlos.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setConfirm('reload')}><RefreshCw className="h-4 w-4" />Recargar el borrador</Button>
        </div>
      ) : null}

      {invalid.length ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby="form-errors-title"
          className="rounded-2xl border border-rose-500/40 bg-rose-500/[0.06] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50">
          <p id="form-errors-title" className="text-sm font-semibold text-rose-700 dark:text-rose-300">
            {invalid.length === 1 ? 'Falta corregir 1 dato antes de guardar' : `Faltan corregir ${invalid.length} datos antes de guardar`}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {invalid.map((e) => (
              <li key={e.key}>
                <button type="button" onClick={() => goTo(e.section)} className="rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50">{e.text}</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={(e) => e.preventDefault()} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          <Section id="section-main" title={kind === 'requests' ? 'Qué se necesita' : 'Proveedor y datos principales'}>
            <MainFields kind={kind} control={control} supplier={supplier} onSupplier={setSupplier} folio={folio} />
          </Section>

          <Section id="section-lines" title="Partidas" description="Bienes y servicios, con su cantidad, unidad, precio e impuesto. Los totales se calculan solos.">
            <LineItemsEditor control={control} getValues={getValues} errors={errors} currency={currency} />
          </Section>

          <Section id="section-terms" title={kind === 'requests' ? 'Fechas y justificación' : 'Condiciones y fechas'}>
            <TermsFields kind={kind} control={control} />
          </Section>

          {(kind === 'invoices' && caps.has('purchaseOrders')) || showInventory ? (
            <Section id="section-links" title="Relaciones" description={kind === 'invoices' ? 'La orden que cobra esta factura (una sola) y los activos de inventario.' : 'Los activos de inventario que cubre este documento.'}>
              <div className="space-y-4">
                {kind === 'invoices' && caps.has('purchaseOrders') ? (
                  <Controller control={control} name="orderIds" render={({ field }) => (
                    <LinkedOrdersField value={field.value} onChange={field.onChange} supplierId={supplierId}
                      known={sourceOrder.data ? { [sourceOrder.data.id]: sourceOrder.data } : Object.fromEntries((existing.data?.orders ?? []).map((o) => [o.id, o]))}
                      invoiceId={isEdit ? id : undefined}
                      inherit={Boolean(inheritItems)} onInheritChange={(v) => setValue('inheritItems', v, { shouldDirty: true })} />
                  )} />
                ) : null}
                {showInventory ? (
                  <Controller control={control} name="inventoryIds" render={({ field }) => (
                    <LinkedInventoryCard ids={field.value} onChange={field.onChange} known={knownItems}
                      onKnown={(items) => setKnownItems((k) => ({ ...k, ...Object.fromEntries(items.map((i) => [i.id, i])) }))} />
                  )} />
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section id="section-files" title="Archivos" description={kind === 'invoices' ? 'PDF y XML de la factura, comprobantes y evidencias.' : 'Cotizaciones, fichas técnicas, fotos o cualquier respaldo.'}>
            <AttachmentsPanel apiBaseUrl={getApiUrl()} token={session?.access_token} companyId={activeCompanyId}
              recordId={isEdit ? id : null} config={{ ...attachmentsConfig(meta.entityType), placement: 'embedded' }}
              context="form" showHeading={false} onControllerReady={(controller) => { attachments.current = controller }} />
          </Section>

          <Section id="section-notes" title="Notas internas">
            <Controller control={control} name="notes" render={({ field }) => (
              <TextareaField rows={3} placeholder="Instrucciones de entrega, acuerdos o aclaraciones." maxLength={2000} {...field} value={field.value ?? ''} />
            )} />
          </Section>
        </div>

        <TotalsCard lines={lines} currency={currency} title={kind === 'requests' ? 'Monto estimado' : 'Total del documento'}
          footnote={kind === 'requests' ? 'El estimado ayuda a decidir si se requiere aprobación o cotizaciones.' : null}>
          <Button type="button" disabled={busy} onClick={submit(true)} className="w-full">
            <Send className="h-4 w-4" />{kind === 'invoices' ? 'Guardar y registrar' : 'Guardar y enviar'}
          </Button>
          <Button type="button" variant="outline" disabled={busy || (isEdit && !isDirty)} onClick={submit(false)} className="w-full">
            <Save className="h-4 w-4" />{busy ? 'Guardando...' : 'Guardar borrador'}
          </Button>
          <Button type="button" variant="ghost" onClick={leave} className="w-full">Cancelar</Button>
          {isDirty ? <p className="text-center text-xs text-[hsl(var(--muted-foreground))]" role="status">Cambios sin guardar</p> : null}
        </TotalsCard>
      </form>

      <ConfirmDialog open={confirm === 'discard'} onOpenChange={(o) => { if (!o) setConfirm(null) }} title="Descartar cambios"
        description="Hay cambios sin guardar en este documento. Si sales ahora se pierden." confirmLabel="Descartar y salir"
        onConfirm={() => { setConfirm(null); navigate(backTo) }} />
      <ConfirmDialog open={confirm === 'reload'} onOpenChange={(o) => { if (!o) setConfirm(null) }} title="Recargar el borrador"
        description="Se mostrará la versión que guardó la otra persona y se descartan tus cambios en pantalla." confirmLabel="Recargar"
        onConfirm={reloadDraft} />
    </div>
  )
}
