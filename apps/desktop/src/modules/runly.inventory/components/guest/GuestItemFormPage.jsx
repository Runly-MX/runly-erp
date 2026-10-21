import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, PageHeader, RecordHeader, SectionCard } from '@runly/ui'
import { ArrowLeft, CopyPlus, Lock, MoreHorizontal, Paperclip, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateGuestItem, useGuestCatalogs, useGuestMe, useUpdateGuestItem, useUploadGuestFile } from '../../hooks/useInventoryGuest.js'
import { useGuestIdentifierConflicts } from '../../hooks/useInventoryGuestCatalog.js'
import { areaPathLabel } from '../../lib/area-tree.js'
import { capabilitiesFor, writableAreas } from '../../lib/guest-capabilities.js'
import { buildGuestPayload, guestCustomEntries, guestItemDefaults, guestItemSchema } from '../../lib/guest-form.js'
import { GUEST_WRITABLE_STATUS_OPTIONS, guestErrorMessage } from '../../lib/guest-session.js'
import { GuestFormFiles } from './GuestFormFiles.jsx'
import { GuestItemFormSections } from './GuestItemFormSections.jsx'

const coarse = '[@media(pointer:coarse)]:min-h-11'

// Full-page create / edit form for suppliers. Same fields and behavior as the main item form:
// action bar (inline on desktop; on mobile a compact fixed bar that only shows once there are changes),
// confirm before discarding changes, validation on blur and focus on the first invalid field. New items go in as a "propuesta de alta" the team confirms.
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
  const [discardOpen, setDiscardOpen] = useState(false)
  const [extraDefs, setExtraDefs] = useState([])
  const [customKey, setCustomKey] = useState(0)
  const again = useRef(false)

  const areaId = watch('areaId')
  const canCreate = capabilitiesFor(me, areaId || null).canCreateModels
  const conflicts = useGuestIdentifierConflicts({ serialNumber: watch('serialNumber'), assetTag: watch('assetTag'), excludeId: item?.id ?? null, original: item })
  const dirty = isDirty || staged.length > 0
  const customEntries = useMemo(() => guestCustomEntries(item, customFields), [item, customFields])
  const originalFieldIds = useMemo(() => (item?.customValues ?? []).map((cv) => cv.fieldId), [item])

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
    const payload = buildGuestPayload(values, { create: isCreate, extraDefs, statusEditable, originalFieldIds })
    try {
      const saved = isCreate ? await create.mutateAsync(payload) : await update.mutateAsync({ id: item.id, ...payload })
      let failed = 0
      for (const file of staged) { try { await upload.mutateAsync({ itemId: saved.id, file }) } catch { failed += 1 } }
      toast.success(isCreate ? 'Propuesta de alta enviada: el equipo debe confirmarla' : 'Cambios guardados')
      if (failed) toast.warning(`${failed} ${failed === 1 ? 'archivo no se pudo subir' : 'archivos no se pudieron subir'}. Súbelos desde el detalle del item.`)
      setStaged([])
      if (isCreate && again.current) {
        reset(guestItemDefaults(null, values.areaId, customFields))
        setCustomKey((k) => k + 1)
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

  function discard() {
    setDiscardOpen(false)
    reset(guestItemDefaults(item, presetArea, customFields))
    setStaged([])
    setCustomKey((k) => k + 1)
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
    <form onSubmit={(e) => { e.preventDefault(); submit(false)() }} noValidate className={dirty ? 'pb-24 transition-[padding] duration-200 motion-reduce:transition-none md:pb-6' : 'pb-6'}>
      <RecordHeader
        sticky={false}
        crumbs={[{ label: 'Inventario', onClick: requestBack }, { label: isCreate ? 'Nuevo item' : (item.name || 'Item') }]}
        title={isCreate ? 'Agregar item' : 'Editar item'}
        subtitle={isCreate ? 'Registra un item en una de tus carpetas. Llegará como propuesta de alta.' : (item.folio || item.name)}
        actions={[{ key: 'back', label: 'Volver', icon: <ArrowLeft className="h-4 w-4" />, placement: 'collapse', onClick: requestBack }]}
      />
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <GuestItemFormSections form={form} item={item} areaOptions={areaOptions} areaLabel={areaPathLabel(areas, areaId) || 'Sin carpeta'}
          catalogs={catalogs} canCreate={canCreate} statusEditable={statusEditable} conflicts={conflicts}
          customEntries={customEntries} customResetKey={customKey} onCustomDefinitions={setExtraDefs} />
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <SectionCard title="Fotos y archivos" icon={Paperclip}>
            <GuestFormFiles itemId={item?.id ?? null} staged={staged} onStagedChange={setStaged} />
          </SectionCard>
        </aside>
      </div>

      {/* Mobile: one compact row, fixed, only while there are changes. md+: the inline row, always. */}
      <div
        aria-hidden={!dirty ? 'true' : undefined}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur transition-[transform,opacity,visibility] duration-200 ease-out motion-reduce:transition-none md:visible md:static md:z-auto md:mt-4 md:translate-y-0 md:border-0 md:bg-transparent md:p-0 md:opacity-100 md:backdrop-blur-none ${dirty ? 'visible translate-y-0 opacity-100' : 'invisible translate-y-full opacity-0'}`}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-2 md:justify-end">
          <Button type="button" variant="ghost" className={`hidden md:inline-flex ${coarse}`} onClick={requestBack}>Cancelar</Button>
          {isCreate ? <Button type="button" variant="outline" className={`hidden md:inline-flex ${coarse}`} disabled={isSubmitting} onClick={submit(true)}>Guardar y agregar otro</Button> : null}
          <Button type="submit" className={`min-w-0 flex-1 md:flex-none ${coarse}`} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : isCreate ? 'Enviar propuesta de alta' : 'Guardar cambios'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="shrink-0 md:hidden" aria-label="Más acciones" disabled={isSubmitting}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              {isCreate ? <DropdownMenuItem className="min-h-11" onSelect={submit(true)}><CopyPlus className="h-4 w-4" />Guardar y agregar otro</DropdownMenuItem> : null}
              <DropdownMenuItem className="min-h-11" onSelect={() => setDiscardOpen(true)}><Undo2 className="h-4 w-4" />Descartar cambios</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ConfirmDialog open={discardOpen} onOpenChange={setDiscardOpen} title="Descartar cambios"
        description="Se restablecerá el formulario y se perderán los cambios sin guardar." confirmLabel="Descartar" onConfirm={discard} />
      <ConfirmDialog open={leaveOpen} onOpenChange={setLeaveOpen} title="Descartar cambios"
        description="Tienes cambios sin guardar. Si sales ahora se perderán." confirmLabel="Descartar" onConfirm={() => { setLeaveOpen(false); onBack() }} />
    </form>
  )
}
