import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, ComboboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SelectField, TextareaField, TextField } from '@runly/ui'
import { PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateGuestItem, useUpdateGuestItem } from '../../hooks/useInventoryGuest.js'
import { areaPathLabel } from '../../lib/area-tree.js'
import { NONE, applicableCustomFields, buildGuestPayload, guestItemDefaults, guestItemSchema } from '../../lib/guest-form.js'
import { GUEST_WRITABLE_STATUS_OPTIONS, guestErrorMessage } from '../../lib/guest-session.js'
import { InventoryCustomFieldsForm } from '../InventoryCustomFieldsForm.jsx'

const withNone = (label, rows = []) => [{ value: NONE, label }, ...rows.map((r) => ({ value: r.id, label: r.name }))]

// Create / edit form restricted to the fields suppliers may touch. Guests cannot
// create catalog entries, so every picker is a plain (non-creatable) combobox.
export function GuestItemDialog({ open, onOpenChange, item = null, areas = [], defaultAreaId = null, catalogs, onSaved }) {
  const create = useCreateGuestItem()
  const update = useUpdateGuestItem()
  const isCreate = !item
  const customFields = catalogs?.customFields ?? []
  const writableAreas = useMemo(() => areas.filter((a) => a.canWrite), [areas])
  const statusEditable = isCreate || GUEST_WRITABLE_STATUS_OPTIONS.some((o) => o.value === item?.status)

  const form = useForm({
    resolver: zodResolver(guestItemSchema),
    defaultValues: guestItemDefaults(item, defaultAreaId, customFields),
  })
  const { control, register, handleSubmit, reset, setError, watch, formState: { errors, isSubmitting } } = form

  useEffect(() => {
    if (!open) return
    const preset = defaultAreaId && writableAreas.some((a) => a.id === defaultAreaId) ? defaultAreaId : writableAreas[0]?.id
    reset(guestItemDefaults(item, preset, customFields))
  }, [open, item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const categoryId = watch('categoryId')
  const visibleFields = applicableCustomFields(customFields, categoryId)
  const areaOptions = writableAreas.map((a) => ({ value: a.id, label: areaPathLabel(areas, a.id) }))

  async function onSubmit(values) {
    const payload = buildGuestPayload(values, { create: isCreate, customFields, statusEditable })
    try {
      const saved = isCreate ? await create.mutateAsync(payload) : await update.mutateAsync({ id: item.id, ...payload })
      toast.success(isCreate ? 'Item agregado' : 'Cambios guardados')
      onOpenChange(false)
      onSaved?.(saved)
    } catch (err) {
      if (err.code === 'SERIAL_EXISTS') setError('serialNumber', { message: guestErrorMessage(err) })
      else if (err.code === 'ASSET_TAG_EXISTS') setError('assetTag', { message: guestErrorMessage(err) })
      else toast.error(guestErrorMessage(err))
    }
  }

  const picker = (name, label, noneLabel, rows) => (
    <Controller name={name} control={control} render={({ field }) => (
      <ComboboxField label={label} value={field.value} options={withNone(noneLabel, rows)} onChange={(v) => field.onChange(v || NONE)} />
    )} />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg">
        <DialogHeader icon={PackagePlus}>
          <DialogTitle>{isCreate ? 'Agregar item' : 'Editar item'}</DialogTitle>
          <DialogDescription>{isCreate ? 'Registra un nuevo item en una de tus carpetas.' : item?.folio ?? 'Actualiza los datos del item.'}</DialogDescription>
        </DialogHeader>
        <form id="guest-item-form" onSubmit={handleSubmit(onSubmit)} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          {isCreate ? (
            <Controller name="areaId" control={control} render={({ field }) => (
              <ComboboxField label="Carpeta" required value={field.value} options={areaOptions} onChange={field.onChange} error={errors.areaId?.message} />
            )} />
          ) : null}
          <TextField label="Nombre" required maxLength={255} error={errors.name?.message} {...register('name')} />
          <div className="grid gap-4 sm:grid-cols-2">
            {picker('categoryId', 'Categoría', 'Sin categoría', catalogs?.categories)}
            {picker('brandId', 'Marca', 'Sin marca', catalogs?.brands)}
            {picker('locationId', 'Ubicación', 'Sin ubicación', catalogs?.locations)}
            {picker('conditionId', 'Condición', 'Sin condición', catalogs?.conditions)}
            <TextField label="Modelo" maxLength={255} error={errors.model?.message} {...register('model')} />
            <TextField label="Número de parte" maxLength={255} error={errors.partNumber?.message} {...register('partNumber')} />
            <TextField label="Número de serie" maxLength={255} error={errors.serialNumber?.message} {...register('serialNumber')} />
            <TextField label="Número de activo" maxLength={100} error={errors.assetTag?.message} {...register('assetTag')} />
          </div>
          {statusEditable ? (
            <Controller name="status" control={control} render={({ field }) => (
              <SelectField label="Estado" value={field.value} options={GUEST_WRITABLE_STATUS_OPTIONS} onValueChange={field.onChange} />
            )} />
          ) : null}
          <TextareaField label="Descripción" rows={3} maxLength={2000} error={errors.description?.message} {...register('description')} />
          <TextareaField label="Notas" rows={3} maxLength={2000} error={errors.notes?.message} {...register('notes')} />
          {visibleFields.length ? (
            <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
              <p className="text-sm font-semibold">Campos adicionales</p>
              <InventoryCustomFieldsForm customFields={visibleFields} control={control} />
            </div>
          ) : null}
        </form>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="guest-item-form" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : isCreate ? 'Agregar item' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
