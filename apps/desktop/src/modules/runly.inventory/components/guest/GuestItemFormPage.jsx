import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, ConfirmDialog, PageHeader, SectionCard } from '@runly/ui'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateGuestItem, useGuestCatalogs, useGuestMe, useUpdateGuestItem, useUploadGuestFile } from '../../hooks/useInventoryGuest.js'
import { useGuestIdentifierConflicts } from '../../hooks/useInventoryGuestCatalog.js'
import { areaPathLabel } from '../../lib/area-tree.js'
import { capabilitiesFor, writableAreas } from '../../lib/guest-capabilities.js'
import { buildGuestPayload, guestItemDefaults, guestItemSchema } from '../../lib/guest-form.js'
import { GUEST_WRITABLE_STATUS_OPTIONS, guestErrorMessage } from '../../lib/guest-session.js'
import { GuestFormFiles } from './GuestFormFiles.jsx'
import { GuestItemFormSections } from './GuestItemFormSections.jsx'

const coarse = '[@media(pointer:coarse)]:min-h-11'

// Full-page create / edit form for suppliers. Same fields and behavior as the main item form:
// sticky action bar (safe-area aware), confirm before discarding changes, validation on blur and
// focus on the first invalid field. New items go in as a "propuesta de alta" the team confirms.
export function GuestItemFormPage({ item = null, defaultAreaId = null, onBack, onSaved }) {
  const me = useGuestMe().data
  const catalogs = useGuestCatalogs().data
  const create = useCreateGuestItem()
  const update = useUpdateGuestItem()
  const upload = useUploadGuestFile()
  const isCreate = !item
  const customFields = useMemo(() => catalogs?.customFields ?? [], [catalogs])
  const areas = useMemo(() => me?.areas ?? [], [me])
  const writable = useMemo(() => writableAreas(me), [me])
  const areaOptions = useMemo(() => writable.map((a) => ({ value: a.id, label: areaPathLabel(areas, a.id) })), [writable, areas])
  const presetArea = defaultAreaId && writable.some((a) => a.id === defaultAreaId) ? defaultAreaId : (writable.length === 1 ? writable[0].id : '')
  const statusEditable = isCreate || GUEST_WRITABLE_STATUS_OPTIONS.some((o) => o.value === item?.status)

  const form = useForm({ resolver: zodResolver(guestItemSchema), mode: 'onBlur', defaultValues: guestItemDefaults(item, presetArea, customFields) })
  const { handleSubmit, reset, setError, setFocus, watch, formState: { isDirty, isSubmitting } } = form
  const [staged, setStaged] = useState([])
  const [leaveOpen, setLeaveOpen] = useState(false)
  const again = useRef(false)

  const areaId = watch('areaId')
  const canCreate = capabilitiesFor(me, areaId || null).canCreateModels
  const conflicts = useGuestIdentifierConflicts({ serialNumber: watch('serialNumber'), assetTag: watch('assetTag'), excludeId: item?.id ?? null, original: item })
  const dirty = isDirty || staged.length > 0

  // Defaults depend on data that may arrive after the first render (catalog custom fields, areas).
  useEffect(() => { if (!isDirty) reset(guestItemDefaults(item, presetArea, customFields)) }, [item?.id, presetArea, customFields.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const requestBack = () => (dirty ? setLeaveOpen(true) : onBack())

  async function onSubmit(values) {
    const payload = buildGuestPayload(values, { create: isCreate, customFields, statusEditable })
    try {
      const saved = isCreate ? await create.mutateAsync(payload) : await update.mutateAsync({ id: item.id, ...payload })
      let failed = 0
      for (const file of staged) { try { await upload.mutateAsync({ itemId: saved.id, file }) } catch { failed += 1 } }
      toast.success(isCreate ? 'Propuesta de alta enviada: el equipo debe confirmarla' : 'Cambios guardados')
      if (failed) toast.warning(`${failed} ${failed === 1 ? 'archivo no se pudo subir' : 'archivos no se pudieron subir'}. Súbelos desde el detalle del item.`)
      setStaged([])
      if (isCreate && again.current) {
        reset(guestItemDefaults(null, values.areaId, customFields))
        window.scrollTo?.({ top: 0 })
        return
      }
      reset(values)
      onSaved(saved.id)
    } catch (err) {
      if (err.code === 'SERIAL_EXISTS') setError('serialNumber', { message: guestErrorMessage(err) })
      else if (err.code === 'ASSET_TAG_EXISTS') setError('assetTag', { message: guestErrorMessage(err) })
      else toast.error(guestErrorMessage(err))
    }
  }

  function onInvalid(errors) {
    const first = Object.keys(errors)[0]
    if (!first) return
    try { setFocus(first) } catch { document.querySelector(`[name="${first}"]`)?.focus() }
  }

  const submit = (keepAdding) => () => { again.current = keepAdding; return handleSubmit(onSubmit, onInvalid)() }

  if (isCreate && me && writable.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Agregar item" onBack={onBack} />
        <Alert><Lock className="h-4 w-4" /><p className="text-sm">Tu acceso es de solo lectura: no puedes agregar items.</p></Alert>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(false)() }} noValidate className="pb-28 md:pb-6">
      <PageHeader
        title={isCreate ? 'Agregar item' : 'Editar item'}
        description={isCreate ? 'Registra un item en una de tus carpetas. Llegará como propuesta de alta.' : (item.folio || item.name)}
        onBack={requestBack}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <GuestItemFormSections form={form} item={item} areaOptions={areaOptions} areaLabel={areaPathLabel(areas, areaId) || 'Sin carpeta'}
          catalogs={catalogs} canCreate={canCreate} statusEditable={statusEditable} conflicts={conflicts} />
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <SectionCard title="Fotos y archivos">
            <GuestFormFiles itemId={item?.id ?? null} staged={staged} onStagedChange={setStaged} />
          </SectionCard>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:z-auto md:mt-4 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-7xl flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="ghost" className={coarse} onClick={requestBack}>Cancelar</Button>
          {isCreate ? <Button type="button" variant="outline" className={coarse} disabled={isSubmitting} onClick={submit(true)}>Guardar y agregar otro</Button> : null}
          <Button type="submit" className={coarse} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : isCreate ? 'Enviar propuesta de alta' : 'Guardar cambios'}
          </Button>
        </div>
      </div>

      <ConfirmDialog open={leaveOpen} onOpenChange={setLeaveOpen} title="Descartar cambios"
        description="Tienes cambios sin guardar. Si sales ahora se perderán." confirmLabel="Descartar" onConfirm={() => { setLeaveOpen(false); onBack() }} />
    </form>
  )
}
