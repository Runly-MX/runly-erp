import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { FileCheck2, Lock } from 'lucide-react'
import { AttachmentsPanel, Button, ConfirmDialog, DateField, EmptyState, PageHeader, TextField, TextareaField } from '@runly/ui'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../../company/ActiveCompanyProvider.jsx'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'
import { errorText, newOperationKey, useSaveDocument } from '../../hooks/usePurchases.js'
import { attachmentsConfig } from '../../lib/attachments.js'
import { ROOT } from '../../lib/purchases-constants.js'
import { documentaryDefaults, documentaryPayload, documentarySchema, emptyDocumentaryLine } from '../../lib/documentary-form.js'
import { SupplierField } from '../SupplierField.jsx'
import { LineItemsEditor } from './LineItemsEditor.jsx'
import { LinkedOrdersField } from './LinkedOrdersField.jsx'
import { LinkedInventoryCard } from './LinkedInventoryCard.jsx'

const UNAVAILABLE = { DOCUMENTARY_UNAVAILABLE: 'Control documental todavía no está disponible en esta instancia (falta su migración).', WORKFLOW_CHANGED: 'La configuración de Compras cambió mientras capturabas. Recarga la página y vuelve a intentarlo.', DOCUMENTARY_MODE_REQUIRED: 'Control documental ya no está activo en tu empresa. Recarga la página.' }

function Section({ id, title, description, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 md:p-5">
      <header className="mb-4">
        <h2 id={`${id}-title`} className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
      </header>
      {children}
    </section>
  )
}

// New order or invoice in Control documental: the reference is the only
// required value; supplier, date, lines, relations, files and notes are
// optional and can be completed later with an audited correction. Same
// fields and components as the financial editor, without any amount.
export function DocumentaryEditor({ kind, meta, can, caps, inventoryIds = [], sourceOrder = null }) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const save = useSaveDocument(kind)
  const attachments = useRef(null)
  // One key per capture attempt: a retry (double click, lost response) never duplicates.
  const operationKey = useRef(newOperationKey('doc'))
  const [supplier, setSupplier] = useState(null)
  const [knownItems, setKnownItems] = useState({})
  const [confirmLeave, setConfirmLeave] = useState(false)
  const form = useForm({ resolver: zodResolver(documentarySchema(kind)), defaultValues: documentaryDefaults({ inventoryIds, orderIds: sourceOrder ? [sourceOrder.id] : [] }) })
  const { control, getValues, setValue, handleSubmit, formState: { errors, isDirty } } = form
  const supplierId = useWatch({ control, name: 'supplierId' })
  const inheritItems = useWatch({ control, name: 'inheritItems' })
  const backTo = `${ROOT}/${kind}`
  const canRelate = can('purchases.relation.manage')
  const showOrder = kind === 'invoices' && caps.has('purchaseOrders') && canRelate && can('purchases.order.read')
  const showInventory = caps.has('inventoryRelations') && canRelate && can('inventory.item.read')
  const canFiles = can('files.assets.read')
  const label = kind === 'orders' ? 'Registrar orden' : 'Registrar factura'

  const submit = handleSubmit(async (values) => {
    let saved
    try {
      saved = await save.mutateAsync({ id: null, data: documentaryPayload(kind, values, { idempotencyKey: operationKey.current }) })
    } catch (error) {
      const code = error?.details?.code
      toast.error(UNAVAILABLE[code] ?? errorText(error, 'No se pudo registrar la referencia'))
      return
    }
    operationKey.current = newOperationKey('doc')
    if (saved?.id && attachments.current?.pendingItems?.length) {
      const upload = await attachments.current.flushPending(saved.id)
      if (!upload?.ok) toast.error('La referencia se registró, pero algunos archivos no se pudieron subir. Súbelos desde el detalle.')
    }
    toast.success(kind === 'orders' ? 'Orden registrada' : 'Factura registrada')
    navigate(`${ROOT}/${kind}/${saved.id}`, { replace: true })
  }, () => toast.error('Escribe el nombre o la referencia del documento'))

  const leave = () => (isDirty ? setConfirmLeave(true) : navigate(backTo))
  const text = (name, fieldLabel, props = {}) => (
    <Controller control={control} name={name} render={({ field, fieldState }) => (
      <TextField id={`doc-${name}`} label={fieldLabel} error={fieldState.error?.message} {...props} {...field} value={field.value ?? ''} />
    )} />
  )
  const date = (name, fieldLabel, hint) => (
    <Controller control={control} name={name} render={({ field, fieldState }) => (
      <DateField id={`doc-${name}`} label={fieldLabel} hint={hint} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} error={fieldState.error?.message} />
    )} />
  )

  return (
    <div className="min-h-dvh space-y-5 p-4 pb-24 md:p-6 md:pb-24">
      <PageHeader eyebrow={`${meta.singular} · Control documental`} title={kind === 'orders' ? 'Registrar orden de compra' : 'Registrar factura'} onBack={leave}
        description="Solo la referencia es obligatoria. Lo demás es opcional y se puede completar después." />

      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          <Section id="section-main" title="Referencia">
            <div className="space-y-4">
              {text('reference', 'Nombre, código o referencia', { required: true, autoFocus: true, placeholder: kind === 'orders' ? 'OC-2485' : 'F-008721',
                hint: 'Como aparece en el documento o como lo conoces. Runly asigna además su folio interno.' })}
              <Controller control={control} name="description" render={({ field }) => (
                <TextareaField id="doc-description" label="Descripción (opcional)" rows={2} maxLength={2000} placeholder="Adaptadores de red para el área de soporte" {...field} value={field.value ?? ''} />
              )} />
            </div>
          </Section>

          <Section id="section-terms" title="Datos opcionales" description="Déjalos vacíos si todavía no los conoces: quedan como «sin capturar», nunca con valores inventados.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Controller control={control} name="supplierId" render={({ field }) => (
                  <SupplierField value={field.value} selected={supplier} hint="Opcional." onChange={(id, row) => { field.onChange(id); setSupplier(row) }} />
                )} />
              </div>
              {date('issueDate', 'Fecha del documento', 'Opcional. No se usa la fecha de registro en su lugar.')}
              {kind === 'orders' ? date('expectedDate', 'Entrega esperada', 'Opcional.') : text('fiscalUuid', 'UUID fiscal (CFDI)', { placeholder: '36 caracteres', hint: 'Opcional; se guarda como dato, no se valida.' })}
            </div>
          </Section>

          <Section id="section-lines" title="Partidas (opcional)" description="Qué ampara el documento y cuántos, si lo sabes. Sin precios ni impuestos.">
            <LineItemsEditor control={control} getValues={getValues} setValue={setValue} errors={errors} documentary newLine={emptyDocumentaryLine} />
          </Section>

          {showOrder || showInventory ? (
            <Section id="section-links" title="Relaciones (opcional)" description={kind === 'invoices' ? 'La orden de esta factura, si existe, y los activos que ampara. Ninguna es obligatoria.' : 'Los activos que ampara esta orden. No necesita factura.'}>
              <div className="space-y-4">
                {showOrder ? (
                  <Controller control={control} name="orderIds" render={({ field }) => (
                    <LinkedOrdersField value={field.value} onChange={field.onChange} supplierId={supplierId} known={sourceOrder ? { [sourceOrder.id]: sourceOrder } : {}}
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

          <Section id="section-files" title="Archivos (opcional)" description="El PDF o la imagen del documento. Se guardan tal como se suben y pueden contener importes.">
            {canFiles ? (
              <AttachmentsPanel apiBaseUrl={getApiUrl()} token={session?.access_token} companyId={activeCompanyId} recordId={null}
                config={{ ...attachmentsConfig(meta.entityType), placement: 'embedded' }} context="form" showHeading={false} onControllerReady={(controller) => { attachments.current = controller }} />
            ) : <EmptyState variant="compact" icon={Lock} title="Sin acceso a archivos" description="Tu rol no permite adjuntar archivos; puedes registrar la referencia sin ellos." />}
          </Section>

          <Section id="section-notes" title="Observaciones (opcional)">
            <Controller control={control} name="notes" render={({ field }) => (
              <TextareaField id="doc-notes" rows={3} placeholder="Cualquier aclaración sobre el documento." maxLength={2000} {...field} value={field.value ?? ''} />
            )} />
          </Section>
        </div>

        <aside className="space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 lg:sticky lg:top-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><FileCheck2 className="h-4 w-4 text-(--brand-primary-computed)" aria-hidden />Control documental</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Se registra la referencia del documento, sin importes, impuestos ni pagos.</p>
          <Button type="submit" disabled={save.isPending} className="w-full">{save.isPending ? 'Registrando...' : label}</Button>
          <Button type="button" variant="ghost" onClick={leave} className="w-full">Cancelar</Button>
          {isDirty ? <p className="text-center text-xs text-[hsl(var(--muted-foreground))]" role="status">Cambios sin guardar</p> : null}
        </aside>
      </form>

      <ConfirmDialog open={confirmLeave} onOpenChange={setConfirmLeave} title="Descartar captura"
        description="Lo que escribiste no se ha registrado. Si sales ahora se pierde." confirmLabel="Descartar y salir" onConfirm={() => { setConfirmLeave(false); navigate(backTo) }} />
    </div>
  )
}
