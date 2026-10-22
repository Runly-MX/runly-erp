import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RunlyCrudView, Button, PageHeader } from '@runly/ui'
import { Plus } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { componentRegistry } from '../../../lib/moduleComponentRegistry'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { useFleetLive } from '../hooks/useFleetLive.js'

const API_BASE = getApiUrl()
const BASE_PATH = '/app/m/runly.fleet/drivers'

const DRIVER_TABLE = {
  key: 'fleet.driver.table',
  kind: 'TABLE',
  schema: {
    entity: 'driver',
    component: 'RunlyTable',
    apiPath: '/fleet/drivers',
    primaryField: 'full_name',
    searchable: true,
    searchPlaceholder: 'Buscar chofer...',
    columns: [
      { field: 'photo_asset_id_resolved', label: 'Foto', sortable: false, component: 'runly.fleet:DriverAvatarCell' },
      { field: 'full_name', label: 'Nombre completo', sortable: true, link: true },
      { field: 'phone', label: 'Telefono', sortable: false },
      { field: 'license_number', label: 'No. Licencia', sortable: true },
      { field: 'license_type', label: 'Tipo licencia', sortable: false, defaultVisible: false },
      { field: 'license_expiry_date', label: 'Vencimiento', sortable: true, type: 'date' },
      { field: 'license_status', label: 'Licencia', sortable: false, component: 'runly.fleet:DriverLicenseBadge' },
      { field: 'assigned_plate', label: 'Vehiculo', sortable: false, component: 'runly.fleet:DriverAssignedVehicleCell' },
      { field: 'hr_employee_name', label: 'Colaborador RH', sortable: false, defaultVisible: false },
      { field: 'status', label: 'Estado', sortable: true, component: 'runly.fleet:DriverStatusBadge' },
    ],
    actions: [{ label: 'Crear chofer', permission: 'fleet.drivers.create', variant: 'primary' }],
    rowActions: [
      { label: 'Ver detalle', permission: 'fleet.drivers.read' },
      { label: 'Editar', permission: 'fleet.drivers.update' },
      { label: 'Desactivar', permission: 'fleet.drivers.delete' },
    ],
    emptyState: {
      icon: 'UserRound',
      title: 'Aún no hay choferes',
      message: 'Registra a quienes manejan tus unidades para controlar su licencia y asignarles un vehículo.',
      actionLabel: 'Crear chofer',
    },
  },
}

export const DRIVER_FORM = {
  key: 'fleet.driver.form',
  kind: 'FORM',
  schema: {
    entity: 'driver',
    component: 'RunlyForm',
    apiPath: '/fleet/drivers',
    formMode: 'page',
    sections: [
      {
        label: 'Datos personales',
        icon: 'UserRound',
        collapsible: true,
        fields: [
          { field: 'first_name', label: 'Nombre', type: 'text', required: true },
          { field: 'last_name', label: 'Apellido', type: 'text', required: true },
          { field: 'phone', label: 'Telefono', type: 'phone', required: true, hint: 'Numero de contacto del chofer' },
          { field: 'email', label: 'Correo', type: 'email' },
        ],
      },
      {
        label: 'Licencia de conducir',
        icon: 'IdCard',
        collapsible: true,
        fields: [
          { field: 'license_number', label: 'No. de licencia', type: 'text', required: true },
          { field: 'license_type', label: 'Tipo de licencia', type: 'text', required: true, hint: 'Ej. A, B, C, E' },
          { field: 'license_expiry_date', label: 'Vencimiento de licencia', type: 'date', required: true },
        ],
      },
      {
        label: 'Estado y notas',
        icon: 'FileText',
        collapsible: true,
        fields: [
          {
            field: 'status', label: 'Estado', type: 'select',
            options: [
              { value: 'active', label: 'Activo' },
              { value: 'inactive', label: 'Inactivo' },
              { value: 'suspended', label: 'Suspendido' },
            ],
          },
          { field: 'notes', label: 'Notas', type: 'markdown', fullWidth: true },
        ],
      },
      {
        id: 'attachments',
        type: 'attachments',
        label: 'Documentos del chofer',
        placement: 'aside',
        collapsible: true,
        attachments: {
          createMode: 'stage-until-parent-create',
          editMode: 'upload-immediately',
          listPath: '/fleet/drivers/:id/documents',
          addPath: '/fleet/drivers/:id/documents',
          removePath: '/fleet/drivers/:id/documents/:docId',
          upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetDriver' },
          signedUrl: { endpointTemplate: '/files/:fileId/signed-url' },
          fields: {
            id: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type',
            label: 'label', createdAt: 'created_at', enabled: 'enabled',
            fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes',
          },
          permissions: {
            read: 'fleet.drivers.read', create: 'fleet.drivers.update',
            remove: 'fleet.drivers.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read',
          },
          limits: { maxFiles: 20, maxSizeMB: 10, allowMultiple: true },
        },
      },
    ],
    submitLabel: 'Guardar chofer',
    cancelLabel: 'Cancelar',
  },
}

const DRIVER_DETAIL = {
  key: 'fleet.driver.detail',
  kind: 'DETAIL',
  schema: {
    entity: 'driver',
    component: 'RunlyDetail',
    apiPath: '/fleet/drivers',
    hero: {
      titleField: 'full_name',
      subtitleFields: ['license_type'],
      statusField: 'status',
      imageField: 'photo_asset_id_resolved',
      fallbackIcon: 'UserRound',
      metaChips: [
        { field: 'phone', label: 'Tel', icon: 'Phone' },
        { field: 'license_number', label: 'Lic.', icon: 'Hash' },
        { field: 'license_expiry_date', label: 'Vence', type: 'date', icon: 'CalendarDays' },
      ],
    },
    kpis: [
      { label: 'Telefono', field: 'phone', icon: 'Phone' },
      { label: 'No. Licencia', field: 'license_number', icon: 'Hash' },
      { label: 'Tipo licencia', field: 'license_type', icon: 'Tag' },
      { label: 'Vencimiento', field: 'license_expiry_date', type: 'date', icon: 'CalendarDays' },
    ],
    sections: [
      {
        label: 'Datos del chofer',
        columns: 2,
        fields: [
          { field: 'full_name', label: 'Nombre completo', icon: 'User' },
          { field: 'phone', label: 'Telefono', icon: 'Phone' },
          { field: 'email', label: 'Correo', icon: 'Mail' },
          { field: 'license_number', label: 'No. Licencia', icon: 'Hash' },
          { field: 'license_type', label: 'Tipo licencia', icon: 'Tag' },
          { field: 'license_expiry_date', label: 'Vencimiento', type: 'date', icon: 'CalendarDays' },
          { field: 'license_status', label: 'Estado licencia', icon: 'ShieldAlert', component: 'runly.fleet:DriverLicenseBadge' },
          { field: 'status', label: 'Estado', icon: 'Activity' },
        ],
      },
      {
        id: 'documents',
        type: 'documents',
        label: 'Documentos del chofer',
        documents: {
          listPath: '/fleet/drivers/:id/documents',
          addPath: '/fleet/drivers/:id/documents',
          removePath: '/fleet/drivers/:id/documents/:docId',
          upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetDriver' },
          fields: {
            associationId: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type',
            label: 'label', createdAt: 'created_at', enabled: 'enabled',
            fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes',
          },
          signedUrl: { endpointTemplate: '/files/:fileId/signed-url' },
          permissions: {
            read: 'fleet.drivers.read', create: 'fleet.drivers.update',
            remove: 'fleet.drivers.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read',
          },
        },
      },
    ],
    actions: [
      { label: 'Editar', permission: 'fleet.drivers.update' },
      { label: 'Desactivar', permission: 'fleet.drivers.delete' },
    ],
  },
}

function parseModeAndId(wildcard) {
  const segs = String(wildcard ?? '').replace(/^\/+/, '').replace(/^drivers\/?/, '').split('/').filter(Boolean)
  if (segs[0] === 'new') return { initialMode: 'create', recordId: null }
  if (segs[1] === 'edit') return { initialMode: 'edit', recordId: segs[0] }
  if (segs[0]) return { initialMode: 'detail', recordId: segs[0] }
  return { initialMode: 'list', recordId: null }
}

// Compact variant opened from the vehicle form when the driver does not exist
// yet: personal data and licence only, in a modal. Status defaults to active;
// notes and documents are added later from the driver's own page.
export const DRIVER_QUICK_FORM_BLUEPRINT = {
  ...DRIVER_FORM,
  key: 'fleet.driver.form.quick',
  schema: {
    ...DRIVER_FORM.schema,
    formMode: 'modal',
    sections: DRIVER_FORM.schema.sections.filter((section) => section.label === 'Datos personales' || section.label === 'Licencia de conducir'),
  },
}

export default function DriversScreen() {
  const { '*': wildcard } = useParams()
  const navigate = useNavigate()
  const { session, userProfile } = useAuth()
  const token = session?.access_token ?? null
  const { activeCompanyId } = useActiveCompany()
  const liveSignal = useFleetLive()
  const canCreate = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('fleet.drivers.create'))

  const { initialMode, recordId } = useMemo(() => parseModeAndId(wildcard), [wildcard])

  const handleNavigate = useCallback(({ mode, recordId }) => {
    const path =
      mode === 'create' ? `${BASE_PATH}/new` :
      mode === 'detail' && recordId ? `${BASE_PATH}/${recordId}` :
      mode === 'edit' && recordId ? `${BASE_PATH}/${recordId}/edit` :
      BASE_PATH
    navigate(path, { replace: true })
  }, [navigate])

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-dvh">
      {initialMode === 'list' && (
        <PageHeader
          eyebrow="Runly Fleet"
          title="Choferes"
          description="Conductores asignados a las unidades de la flota."
          actions={
            canCreate && (
              <Button onClick={() => navigate(`${BASE_PATH}/new`)}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo chofer
              </Button>
            )
          }
        />
      )}
      <RunlyCrudView
        tableBlueprint={DRIVER_TABLE}
        formBlueprint={DRIVER_FORM}
        detailBlueprint={DRIVER_DETAIL}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={API_BASE}
        initialMode={initialMode}
        recordId={recordId}
        onNavigate={handleNavigate}
        refreshSignal={liveSignal}
        componentRegistry={componentRegistry}
        suppressToolbarCreate
        showEmptyCreate={canCreate}
      />
    </div>
  )
}
