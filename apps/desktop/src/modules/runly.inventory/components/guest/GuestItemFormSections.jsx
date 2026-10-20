import { Controller } from 'react-hook-form'
import { ComboboxField, DateField, DynamicFieldsSection, SectionCard, SelectField, TextareaField, TextField } from '@runly/ui'
import { Activity, Barcode, FolderTree, Hash, MapPin, Package, ScanLine, StickyNote } from 'lucide-react'
import { useMemo } from 'react'
import { InventoryDataProvider } from '../../hooks/inventoryData.js'
import { guestInventoryData } from '../../hooks/useInventoryGuestCatalog.js'
import { identifierConflictMessage } from '../../lib/guest-capabilities.js'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'
import { useGuestCall } from '../../hooks/useInventoryGuest.js'
import { GUEST_WRITABLE_STATUS_OPTIONS } from '../../lib/guest-session.js'
import { InventoryItemClassification } from '../InventoryItemClassification.jsx'
import { GuestCatalogField } from './GuestCatalogField.jsx'

const CUSTOM_PREFIX = 'customValues'
const GUEST_CUSTOM_FIELDS = { apiPath: '/inventory/guest/custom-fields', valuePrefix: CUSTOM_PREFIX, categoryField: 'categoryId' }

// Custom fields on demand, like the main item form: only the ones the item holds (or requires) show,
// the supplier adds the rest from the chooser and can remove them. Suppliers cannot create field
// definitions (no createPath). Flat `customValues.<key>` values are bridged to the nested form value.
function GuestCustomFields({ form, entries, resetKey, onDefinitionsChange }) {
  const { sessionToken } = useGuestCall()
  const { watch, setValue } = form
  const custom = watch(CUSTOM_PREFIX) ?? {}
  const headers = useMemo(() => ({ Authorization: `Guest ${sessionToken}` }), [sessionToken])
  const formValues = useMemo(() => {
    const flat = {}
    for (const [k, v] of Object.entries(custom)) flat[`${CUSTOM_PREFIX}.${k}`] = v
    return flat
  }, [custom])
  const onFieldChange = (name, value) => {
    const key = name.slice(CUSTOM_PREFIX.length + 1)
    setValue(CUSTOM_PREFIX, { ...(form.getValues(CUSTOM_PREFIX) ?? {}), [key]: value }, { shouldDirty: true })
  }
  return (
    <DynamicFieldsSection key={resetKey} config={GUEST_CUSTOM_FIELDS} formValues={formValues} onFieldChange={onFieldChange}
      initialEntries={entries} apiBaseUrl={getApiUrl()} headers={headers} onDefinitionsChange={onDefinitionsChange} />
  )
}

const CLASSIFICATION_KEYS = ['modelId', 'model', 'categoryId', 'brandId']

function ConflictNote({ field, hit }) {
  const message = identifierConflictMessage(field, hit)
  return message ? <p role="alert" className="mt-1.5 text-xs text-amber-800 dark:text-amber-200">{message} Revisa que no sea un duplicado.</p> : null
}

// Sections follow the main item form (blueprint INVENTORY_ITEM_FORM): classification, identification,
// location and status, warranty, custom fields and notes. Everything commercial / administrative is absent.
export function GuestItemFormSections({ form, item, areaOptions, areaLabel, catalogs, canCreate, statusEditable, conflicts, customEntries, customResetKey, onCustomDefinitions }) {
  const { control, register, watch, setValue, formState: { errors } } = form
  const values = watch()
  const err = (k) => errors[k]?.message

  function applyClassification(patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (CLASSIFICATION_KEYS.includes(key)) setValue(key, value ?? (key === 'model' ? '' : null), { shouldDirty: true, shouldValidate: key === 'model' })
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Modelo, tipo y marca" description="Elige un modelo del catálogo y se completan el tipo y la marca.">
        <div className="space-y-4">
          {!item && areaOptions.length > 1 ? (
            <Controller name="areaId" control={control} render={({ field }) => (
              <ComboboxField label="Carpeta" icon={FolderTree} required value={field.value} options={areaOptions} onChange={field.onChange}
                error={err('areaId')} hint="Elige la carpeta donde se registra el item." placeholder="Elegir carpeta..." />
            )} />
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]"><FolderTree className="h-3.5 w-3.5" />Carpeta: <span className="font-medium text-[hsl(var(--foreground))]">{areaLabel}</span></p>
          )}
          <InventoryDataProvider value={guestInventoryData}>
            <InventoryItemClassification hideArea value={values} onChange={applyClassification}
              errors={{ modelId: err('modelId'), model: err('model'), categoryId: err('categoryId'), brandId: err('brandId') }} />
          </InventoryDataProvider>
        </div>
      </SectionCard>

      <SectionCard title="Identificación">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Folio" icon={Hash} hint="Se genera solo si lo dejas vacío" maxLength={50} error={err('folio')} {...register('folio')} />
          <div>
            <TextField label="Número de serie" icon={Barcode} maxLength={255} error={err('serialNumber')} {...register('serialNumber')} />
            <ConflictNote field="serialNumber" hit={conflicts.serialNumber} />
          </div>
          <div>
            <TextField label="Número de activo" icon={Hash} hint="Opcional" maxLength={100} error={err('assetTag')} {...register('assetTag')} />
            <ConflictNote field="assetTag" hit={conflicts.assetTag} />
          </div>
          <TextField label="Número de parte" icon={ScanLine} maxLength={255} error={err('partNumber')} {...register('partNumber')} />
          <div className="md:col-span-2">
            <TextField label="Nombre" icon={Package} maxLength={255} error={err('name')}
              hint="Si lo dejas vacío se genera con tipo, marca y modelo (p. ej. «Dell XPS 15»)." {...register('name')} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Ubicación y estado">
        <div className="grid gap-4 md:grid-cols-2">
          <Controller name="locationId" control={control} render={({ field }) => (
            <GuestCatalogField kind="locations" noun="Ubicación" label="Ubicación" icon={MapPin} rows={catalogs?.locations} value={field.value} onChange={field.onChange} canCreate={canCreate} />
          )} />
          {statusEditable ? (
            <Controller name="status" control={control} render={({ field }) => (
              <SelectField label="Disponibilidad" required value={field.value} options={GUEST_WRITABLE_STATUS_OPTIONS} onValueChange={field.onChange} />
            )} />
          ) : null}
          <Controller name="conditionId" control={control} render={({ field }) => (
            <GuestCatalogField kind="conditions" noun="Condición" label="Condición" icon={Activity} rows={catalogs?.conditions} value={field.value} onChange={field.onChange} canCreate={canCreate} />
          )} />
        </div>
      </SectionCard>

      <SectionCard title="Garantía">
        <div className="grid gap-4 md:grid-cols-2">
          <Controller name="warrantyExpiry" control={control} render={({ field }) => (
            <DateField label="Vencimiento de garantía" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} name={field.name} error={err('warrantyExpiry')} />
          )} />
          <div className="md:col-span-2"><TextareaField label="Notas de garantía" rows={3} maxLength={2000} error={err('warrantyNotes')} {...register('warrantyNotes')} /></div>
        </div>
      </SectionCard>

      <SectionCard title="Campos personalizados" description="Agrega solo los datos adicionales que necesites.">
        <GuestCustomFields form={form} entries={customEntries} resetKey={customResetKey} onDefinitionsChange={onCustomDefinitions} />
      </SectionCard>

      <SectionCard title="Notas">
        <TextareaField label="Notas adicionales" icon={StickyNote} rows={3} maxLength={2000} error={err('notes')} {...register('notes')} />
      </SectionCard>
    </div>
  )
}
