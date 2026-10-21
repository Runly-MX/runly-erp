import { useEffect, useMemo, useRef, useState } from 'react'
import { itemLabel } from '../lib/item-label.js'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState, ConfirmDialog, FormSkeleton } from '@runly/ui'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { useInventoryItem, useDeleteInventoryItem } from '../hooks/useInventoryItems.js'
import { buildItemFormBlueprint } from '../blueprints/inventory-item-form.blueprint.js'
import { inventoryFormComponents } from '../components/InventoryItemClassification.jsx'
import { InventoryFormHeader, INVENTORY_FORM_ID } from '../components/InventoryFormHeader.jsx'
import { InventoryCaptureTools } from '../components/InventoryCaptureTools.jsx'
import { MAX_BULK_SERIALS, bulkUnitName, canPinField, captureStorageKey, loadCapture, parseSerials } from '../lib/capture.js'
import { intakeRequest } from '../lib/intake.js'
import { useIdentifierConflicts, IDENTIFIER_CONFLICT_MESSAGES } from '../hooks/useIdentifierConflicts.js'
import { InventoryIdentifierConflict } from '../components/InventoryIdentifierConflict.jsx'
import { ProposalDialog } from '../components/proposals/ProposalDialog.jsx'
import { useSubmitChangeProposal } from '../hooks/useChangeProposals.js'
import { useInventoryBrands, useInventoryCategories, useInventoryLocations } from '../hooks/useInventoryCatalogs.js'
import { useInventoryConditions } from '../hooks/useInventoryAdmin.js'
import { buildProposalFields } from '../lib/proposal-fields.js'
import { ConnectedRunlyForm } from '../../../shell/connections/ConnectedRunlyForm.jsx'

const API_BASE = getApiUrl()
const LIST_PATH = '/app/m/runly.inventory/inventory'

// Reports the typed serial / asset number up to the screen (renders nothing) and keeps the latest form values
// in `valuesRef` for the "send to review" dialog.
function IdentifierWatcher({ values, onChange, valuesRef }) {
  valuesRef.current = values
  const serialNumber = values?.serialNumber ?? ''
  const assetTag = values?.assetTag ?? ''
  useEffect(() => { onChange({ serialNumber, assetTag }) }, [serialNumber, assetTag]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function InventoryItemForm() {
  const { '*': wildcard } = useParams()
  const id = useMemo(() => {
    const parts = (wildcard ?? '').split('/')
    return parts[2] === 'edit' ? parts[1] : null
  }, [wildcard])
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const { session, userProfile } = useAuth()
  const token = session?.access_token
  const { activeCompanyId } = useActiveCompany()

  const queryClient = useQueryClient()
  // Capture settings (pinned fields, continuous, bulk by serial) live in this browser.
  const storageKey = captureStorageKey(activeCompanyId, session?.user?.id)
  const [settings, setSettings] = useState(() => loadCapture(storageKey))
  const [formKey, setFormKey] = useState(0)
  const [serialsText, setSerialsText] = useState('')
  useEffect(() => { setSettings(loadCapture(storageKey)); setFormKey((k) => k + 1) }, [storageKey])
  // Re-read on every new blank form so the latest pinned values prefill it.
  const createInitial = useMemo(() => loadCapture(storageKey).values, [storageKey, formKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitBulk({ payload }) {
    const { serials } = parseSerials(serialsText)
    if (!serials.length) throw new Error('Escribe al menos un número de serie.')
    if (serials.length > MAX_BULK_SERIALS) throw new Error(`Máximo ${MAX_BULK_SERIALS} series por captura.`)
    const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
    const partNumber = payload.partNumber ?? null
    const body = {
      key,
      common: payload,
      units: serials.map((serialNumber) => ({
        serialNumber,
        name: bulkUnitName(payload.name, serialNumber),
        // The user typed these serials, so they count as confirmed.
        confirmedIdentifiers: { serialNumber, partNumber, assetTag: null },
      })),
    }
    const request = (path) => intakeRequest({ apiBaseUrl: API_BASE, token, companyId: activeCompanyId, path, body })
    const checked = await request('/inventory/items/validate-batch')
    if (!checked.valid) {
      const bad = [...new Set(checked.issues.filter((i) => i.field === 'serialNumber').map((i) => serials[i.index]))]
      throw new Error(bad.length
        ? `Estas series ya existen: ${bad.slice(0, 10).join(', ')}${bad.length > 10 ? '…' : ''}. Quítalas y vuelve a guardar.`
        : (checked.issues[0]?.message ?? 'Revisa la captura.'))
    }
    const result = await request('/inventory/items/bulk')
    void queryClient.invalidateQueries({ queryKey: ['inventory'] })
    return { data: result, bulk: true }
  }

  const itemQuery = useInventoryItem(isEdit ? id : null)
  const editItem = itemQuery.data?.data ?? itemQuery.data ?? null
  // Legacy purchase fields only stay editable on items that already carry them;
  // new commercial data is recorded in Compras.
  const showLegacyPurchase = Boolean(isEdit && editItem?.hasLegacyPurchaseData)
  // Order / invoice pickers need to read Compras; saving them needs manage (checked server side too).
  const showPurchaseLinks = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('purchases.relation.read'))
  const blueprint = useMemo(() => buildItemFormBlueprint(isEdit, { showLegacyPurchase, showPurchaseLinks }), [isEdit, showLegacyPurchase, showPurchaseLinks])
  const deleteItem = useDeleteInventoryItem()

  const [typedIds, setTypedIds] = useState({ serialNumber: '', assetTag: '' })
  const [serverConflict, setServerConflict] = useState(null)
  // Restricted duplicate (exists in a folder the user cannot open): { kind, matched } while the dialog is open.
  const [proposal, setProposal] = useState(null)
  const formValuesRef = useRef({})
  const submitProposal = useSubmitChangeProposal()
  const categories = useInventoryCategories().data?.data
  const brands = useInventoryBrands().data?.data
  const locations = useInventoryLocations().data?.data
  const conditions = useInventoryConditions().data?.data
  const liveConflicts = useIdentifierConflicts({
    apiBaseUrl: API_BASE, token, companyId: activeCompanyId,
    serialNumber: typedIds.serialNumber, assetTag: typedIds.assetTag,
    excludeId: id, original: isEdit ? editItem : null, enabled: !settings.multi,
  })
  // A 409 from save stays shown until the user edits the offending field.
  const conflicts = {
    serialNumber: liveConflicts.serialNumber ?? (serverConflict?.field === 'serialNumber' && serverConflict.value === typedIds.serialNumber ? serverConflict.item : null),
    assetTag: liveConflicts.assetTag ?? (serverConflict?.field === 'assetTag' && serverConflict.value === typedIds.assetTag ? serverConflict.item : null),
  }
  const conflictField = conflicts.serialNumber ? 'serialNumber' : conflicts.assetTag ? 'assetTag' : null
  const proposeFor = (field) => (kind) => setProposal({ kind, matched: { field, value: typedIds[field] } })
  const fieldNotes = {
    serialNumber: <InventoryIdentifierConflict field="serialNumber" item={conflicts.serialNumber} onPropose={proposeFor('serialNumber')} />,
    assetTag: <InventoryIdentifierConflict field="assetTag" item={conflicts.assetTag} onPropose={proposeFor('assetTag')} />,
  }
  const restricted = Boolean(conflictField && conflicts[conflictField]?.restricted)
  function handleSubmitError(err) {
    const field = err?.code === 'SERIAL_EXISTS' ? 'serialNumber' : err?.code === 'ASSET_TAG_EXISTS' ? 'assetTag' : null
    if (field && err.details?.item) setServerConflict({ field, item: err.details.item, value: typedIds[field] })
  }

  if (isEdit && itemQuery.isLoading) {
    return <div className="p-4 md:p-6"><FormSkeleton sections={4} /></div>
  }
  if (isEdit && itemQuery.isError) {
    return <ErrorState message="No se pudo cargar el activo" />
  }

  const handleDelete = async () => {
    await deleteItem.mutateAsync(id)
    toast.success('Activo desactivado', { description: 'Puedes reactivarlo o eliminarlo definitivamente en Desactivados.' })
    navigate('/app/m/runly.inventory/inventory')
  }

  return (
    <div className="px-4 pb-24 md:px-6 [--form-sticky-offset:6rem]">
      <InventoryFormHeader
        isEdit={isEdit}
        item={editItem}
        id={id}
        onCancel={() => navigate(isEdit ? `${LIST_PATH}/${id}` : LIST_PATH)}
        onView={() => navigate(`${LIST_PATH}/${id}`)}
        onNew={() => navigate(`${LIST_PATH}/new`)}
        onDeactivate={() => setDeleteOpen(true)}
      />
      <div className="mt-4">
        <ConnectedRunlyForm
          id={INVENTORY_FORM_ID}
          targetType="inventory_item"
          targetId={id}
          key={isEdit ? 'edit' : `create-${formKey}`}
          blueprint={blueprint}
          initialData={isEdit ? editItem : createInitial}
          submitRequest={!isEdit && settings.multi ? submitBulk : null}
          fieldPins={isEdit ? null : {
            pinned: settings.pinned,
            visible: settings.pinMode,
            canPin: canPinField,
            onToggle: (names, pin) => setSettings((prev) => ({
              ...prev,
              pinned: pin ? [...new Set([...prev.pinned, ...names])] : prev.pinned.filter((name) => !names.includes(name)),
            })),
          }}
          renderTools={(tools) => (
            <>
              <IdentifierWatcher values={tools.values} onChange={setTypedIds} valuesRef={formValuesRef} />
              {isEdit ? null : (
                <InventoryCaptureTools {...tools} settings={settings} setSettings={setSettings} storageKey={storageKey}
                  serialsText={serialsText} setSerialsText={setSerialsText} />
              )}
            </>
          )}
          fieldNotes={fieldNotes}
          submitBlockedReason={conflictField ? (restricted ? `${IDENTIFIER_CONFLICT_MESSAGES[conflictField]} en una carpeta sin acceso. Envía tus datos a revisión o solicita acceso.` : `${IDENTIFIER_CONFLICT_MESSAGES[conflictField]}. Actualiza ese equipo en lugar de crear uno nuevo.`) : ''}
          onSubmitError={handleSubmitError}
          mode={isEdit ? 'edit' : 'create'}
          token={token}
          companyId={activeCompanyId}
          apiBaseUrl={API_BASE}
          componentRegistry={inventoryFormComponents}
          onSuccess={(result) => {
            if (!isEdit && (result?.bulk || settings.continuous)) {
              const count = result?.data?.items?.length
              toast.success(result?.bulk ? `${count} activos creados` : (result?.data?.assetTag ? `Activo ${result.data.assetTag} creado` : 'Activo creado'))
              if (settings.continuous) { setSerialsText(''); setFormKey((k) => k + 1); return }
              navigate('/app/m/runly.inventory/inventory')
              return
            }
            const savedId = result?.data?.id ?? editItem?.id
            navigate(savedId ? `/app/m/runly.inventory/inventory/${savedId}` : '/app/m/runly.inventory/inventory')
          }}
          onCancel={() => navigate(isEdit ? `/app/m/runly.inventory/inventory/${id}` : '/app/m/runly.inventory/inventory')}
        />
      </div>

      <ProposalDialog
        open={Boolean(proposal)}
        onOpenChange={(v) => { if (!v) setProposal(null) }}
        kind={proposal?.kind}
        matched={proposal?.matched}
        fields={proposal ? buildProposalFields(formValuesRef.current, { categories, brands, locations, conditions }) : []}
        onSubmit={(body) => submitProposal.mutateAsync(body)}
      />

      {isEdit && editItem ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Desactivar activo"
          description={`"${itemLabel(editItem)}": Dejará de mostrarse en el inventario; sus datos se conservan. Podrás reactivarlo o eliminarlo definitivamente en Inventario > Desactivados.`}
          confirmLabel="Desactivar"
          onConfirm={handleDelete}
        />
      ) : null}
    </div>
  )
}
