import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Save } from 'lucide-react'
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, UnsavedChangesBar } from '@runly/ui'
import { usePurchasesCan, usePurchasesSettings, useUpdatePurchasesSettings } from '../hooks/usePurchases.js'
import { PRESETS } from '../lib/purchases-constants.js'
import { flowStages, presetValues, settingsSchema, toFormValues, toPayload } from '../lib/settings-form.js'
import { PurchaseFlowRibbon } from '../components/PurchaseFlowRibbon.jsx'
import { PresetCards } from '../components/settings/PresetCards.jsx'
import { StagesPanel } from '../components/settings/StagesPanel.jsx'
import { PoliciesEditor } from '../components/settings/PoliciesEditor.jsx'
import { NumberingPanel } from '../components/settings/NumberingPanel.jsx'
import { ApprovalChatPanel } from '../components/settings/ApprovalChatPanel.jsx'
import { EconomicModePanel } from '../components/settings/EconomicModePanel.jsx'

// Process configuration: template (preset), capabilities, stage modes and
// policies, with the resulting track previewed live at the top.
export default function PurchaseSettingsScreen() {
  const settings = usePurchasesSettings()
  const update = useUpdatePurchasesSettings()
  const can = usePurchasesCan()
  const canManage = can('purchases.settings.manage')
  const form = useForm({ resolver: zodResolver(settingsSchema), defaultValues: toFormValues(null) })
  const { control, handleSubmit, reset, setValue, getValues, formState: { errors, isDirty } } = form
  const [preset, capabilities, modes] = useWatch({ control, name: ['preset', 'capabilities', 'modes'] })
  const workflow = settings.data?.workflow
  const presets = settings.data?.presets ?? {}
  const economicMode = settings.data?.economicMode ?? workflow?.economicMode ?? 'FINANCIAL'
  const documentary = economicMode === 'DOCUMENTARY'
  const changeMode = (mode) => update.mutate(mode === 'DOCUMENTARY' ? { profile: 'DOCUMENTARY' } : { economicMode: 'FINANCIAL', preset: 'BASIC' })

  useEffect(() => { if (workflow) reset(toFormValues(workflow)) }, [workflow, reset])

  if (settings.isLoading) return <div className="min-h-dvh p-4 md:p-6"><LoadingState /></div>
  if (settings.isError) return <div className="min-h-dvh p-4 md:p-6"><ErrorState title="No se pudo cargar la configuración" onRetry={() => settings.refetch()} /></div>
  if (!can('purchases.settings.read') && !canManage) return <div className="min-h-dvh p-4 md:p-6"><EmptyState icon={Lock} title="Sin permiso" description="Tu rol no puede ver la configuración de Compras." /></div>

  const stages = flowStages(capabilities, modes)
  const choosePreset = (key) => {
    setValue('preset', key, { shouldDirty: true })
    if (key !== 'CUSTOM' && presets[key]) {
      const values = presetValues(presets[key])
      setValue('capabilities', values.capabilities, { shouldDirty: true })
      setValue('modes', values.modes, { shouldDirty: true })
    }
  }
  const toCustom = () => { if (getValues('preset') !== 'CUSTOM') setValue('preset', 'CUSTOM', { shouldDirty: true }) }
  const setCapability = (key, on) => { toCustom(); setValue('capabilities', { ...getValues('capabilities'), [key]: on }, { shouldDirty: true }) }
  const setMode = (type, mode) => { toCustom(); setValue('modes', { ...getValues('modes'), [type]: mode }, { shouldDirty: true }) }
  const save = handleSubmit((values) => update.mutate(toPayload(values), { onSuccess: () => reset(values) }))
  const presetName = PRESETS.find((p) => p.key === preset)?.name

  return (
    <div className="min-h-dvh space-y-5 p-4 pb-24 md:p-6 md:pb-24">
      <PageHeader eyebrow="Compras" title="Configuración" description="Dimensiona el proceso a tu empresa. Cambiarlo no borra documentos ni historial."
        actions={canManage ? <Button onClick={save} disabled={!isDirty || update.isPending}><Save className="h-4 w-4" />{update.isPending ? 'Guardando...' : 'Guardar cambios'}</Button> : null} />

      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 md:p-6">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Así se verá tu proceso</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{documentary ? 'Control documental' : `Flujo ${presetName?.toLowerCase()}`}, {stages.length} {stages.length === 1 ? 'etapa' : 'etapas'}{documentary ? ' opcionales' : ''}</h2>
        <div className="mt-4 rounded-xl bg-[hsl(var(--muted))]/30 px-3 py-4">
          <PurchaseFlowRibbon stages={stages} />
        </div>
      </section>

      <EconomicModePanel mode={economicMode} available={settings.data?.documentaryAvailable !== false} canManage={canManage} saving={update.isPending} onChange={changeMode} />

      {documentary ? (
        // The documentary profile fixes its stages (orders, invoices, relations; all optional) and has no policies.
        <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
          En Control documental el proceso es fijo: órdenes, facturas y relaciones con Inventarios, todas opcionales y sin políticas. Para elegir otra plantilla, vuelve al modo financiero.
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Plantilla</h2>
            <PresetCards presets={presets} value={preset} customStages={stages} onChange={choosePreset} disabled={!canManage} />
          </section>
          <StagesPanel capabilities={capabilities ?? {}} modes={modes ?? {}} onCapability={setCapability} onMode={setMode} disabled={!canManage} />
          <PoliciesEditor control={control} errors={errors} enabledStages={stages.map((s) => s.type)} disabled={!canManage} />
        </>
      )}
      <NumberingPanel control={control} capabilities={capabilities} disabled={!canManage} />
      {!documentary && capabilities?.approvals ? <ApprovalChatPanel disabled={!canManage} /> : null}

      {canManage && isDirty ? (
        <UnsavedChangesBar onSave={save} onDiscard={() => reset(toFormValues(workflow))} saving={update.isPending} saveLabel="Guardar cambios" />
      ) : null}
    </div>
  )
}
