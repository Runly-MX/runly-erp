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
const BASE_PATH = '/app/m/runly.fleet/insurance'

const INSURANCE_TABLE = {
  key: 'fleet.insurance_policy.table',
  kind: 'TABLE',
  schema: {
    entity: 'insurance_policy',
    component: 'RunlyTable',
    apiPath: '/fleet/insurance',
    primaryField: 'policy_number',
    searchable: false,
    columns: [
      { field: 'vehicle_plate', label: 'Matricula', sortable: false },
      { field: 'insurer_name', label: 'Aseguradora', sortable: true },
      { field: 'policy_number', label: 'No. Poliza', sortable: true, link: true },
      { field: 'coverage_type', label: 'Cobertura', sortable: false, component: 'runly.fleet:CoverageTypeBadge' },
      { field: 'start_date', label: 'Inicio vigencia', sortable: true, type: 'date', defaultVisible: false },
      { field: 'expiry_date', label: 'Fin vigencia', sortable: true, type: 'date' },
      { field: 'is_active', label: 'Estado', sortable: false, type: 'boolean' },
    ],
    actions: [{ label: 'Nueva poliza', permission: 'fleet.insurance.create', variant: 'primary' }],
    rowActions: [
      { label: 'Ver detalle', permission: 'fleet.insurance.read' },
      { label: 'Editar', permission: 'fleet.insurance.update' },
      { label: 'Desactivar', permission: 'fleet.insurance.delete' },
    ],
    emptyState: {
      icon: 'ShieldCheck',
      title: 'Aún no hay pólizas',
      message: 'Registra las pólizas de tus vehículos para recibir avisos antes de que venzan.',
      actionLabel: 'Crear póliza',
    },
  },
}

const INSURANCE_FORM = {
  key: 'fleet.insurance_policy.form',
  kind: 'FORM',
  schema: {
    entity: 'insurance_policy',
    component: 'RunlyForm',
    apiPath: '/fleet/insurance',
    sections: [
      {
        label: 'Datos de la poliza',
        icon: 'ShieldCheck',
        collapsible: true,
        fields: [
          {
            field: 'vehicle_id',
            label: 'Vehiculo',
            type: 'relation',
            required: true,
            relation: {
              apiPath: '/fleet/vehicles',
              labelField: 'plate',
              pageSize: 50,
              preload: false,
              clearable: false,
              disabledField: 'enabled',
            },
          },
          { field: 'insurer_name', label: 'Aseguradora', type: 'text', required: true, hint: 'Nombre de la compania aseguradora' },
          { field: 'policy_number', label: 'Numero de poliza', type: 'text', required: true, hint: 'Identificador unico de la poliza' },
          {
            field: 'coverage_type',
            label: 'Tipo de cobertura',
            type: 'select',
            options: ['basic', 'comprehensive', 'third_party', 'other'],
          },
        ],
      },
      {
        label: 'Vigencia y costos',
        icon: 'CalendarDays',
        collapsible: true,
        fields: [
          { field: 'start_date', label: 'Inicio de vigencia', type: 'date', required: true },
          { field: 'expiry_date', label: 'Fin de vigencia', type: 'date', required: true },
          { field: 'premium', label: 'Prima anual', type: 'currency' },
          { field: 'currency', label: 'Moneda', type: 'text', hint: 'Codigo de 3 letras (ej. MXN, USD)' },
        ],
      },
      {
        label: 'Notas y adjunto',
        icon: 'FileText',
        collapsible: true,
        fields: [
          { field: 'notes', label: 'Notas adicionales', type: 'markdown' },
          { field: 'document_asset_id', label: 'Certificado (PDF)', type: 'file' },
        ],
      },
    ],
    submitLabel: 'Guardar poliza',
    cancelLabel: 'Cancelar',
  },
}

const INSURANCE_DETAIL = {
  key: 'fleet.insurance_policy.detail',
  kind: 'DETAIL',
  schema: {
    entity: 'insurance_policy',
    component: 'RunlyDetail',
    apiPath: '/fleet/insurance',
    hero: {
      titleField: 'insurer_name',
      subtitleFields: ['policy_number'],
      statusField: 'status',
      statusMap: { active: 'Vigente', expired: 'Vencida', disabled: 'Inactiva' },
      fallbackIcon: 'ShieldCheck',
      metaChips: [
        { field: 'vehicle_plate', label: 'Vehiculo', icon: 'Truck' },
        { field: 'coverage_type_label', label: 'Cobertura', icon: 'Shield' },
        { field: 'expiry_date', label: 'Vence', type: 'date', icon: 'CalendarDays' },
      ],
    },
    kpis: [
      { label: 'Cobertura', field: 'coverage_type_label', icon: 'Shield' },
      { label: 'Prima anual', field: 'premium', type: 'currency', icon: 'DollarSign' },
      { label: 'Inicio', field: 'start_date', type: 'date', icon: 'CalendarDays' },
      { label: 'Fin vigencia', field: 'expiry_date', type: 'date', icon: 'CalendarDays' },
    ],
    sections: [
      {
        label: 'Datos de la poliza',
        columns: 2,
        fields: [
          { field: 'vehicle_plate', label: 'Vehiculo (matricula)', icon: 'Truck' },
          { field: 'insurer_name', label: 'Aseguradora', icon: 'ShieldCheck' },
          { field: 'policy_number', label: 'Numero de poliza', icon: 'Hash' },
          { field: 'coverage_type', label: 'Tipo de cobertura', icon: 'Shield' },
          { field: 'is_active', label: 'Estado', type: 'boolean', icon: 'Activity' },
        ],
      },
      {
        label: 'Vigencia y costos',
        columns: 2,
        fields: [
          { field: 'start_date', label: 'Inicio de vigencia', type: 'date', icon: 'CalendarDays' },
          { field: 'expiry_date', label: 'Fin de vigencia', type: 'date', icon: 'CalendarDays' },
          { field: 'premium', label: 'Prima anual', type: 'currency', icon: 'DollarSign' },
          { field: 'currency', label: 'Moneda', icon: 'Tag' },
        ],
      },
      {
        label: 'Notas',
        fields: [{ field: 'notes', label: 'Notas adicionales', type: 'markdown', icon: 'FileText' }],
      },
      {
        id: 'certificate',
        type: 'file-preview',
        label: 'Certificado de seguro',
        filePreview: {
          fileAssetIdField: 'document_asset_id',
          signedUrl: { endpointTemplate: '/files/:fileId/signed-url' },
          permissions: { read: 'fleet.insurance.read', fileRead: 'files.assets.read' },
        },
      },
    ],
    actions: [
      { label: 'Editar', permission: 'fleet.insurance.update' },
      { label: 'Desactivar', permission: 'fleet.insurance.delete' },
    ],
  },
}

function parseModeAndId(wildcard) {
  const segs = String(wildcard ?? '').replace(/^\/+/, '').replace(/^insurance\/?/, '').split('/').filter(Boolean)
  if (segs[0] === 'new') return { initialMode: 'create', recordId: null }
  if (segs[1] === 'edit') return { initialMode: 'edit', recordId: segs[0] }
  if (segs[0]) return { initialMode: 'detail', recordId: segs[0] }
  return { initialMode: 'list', recordId: null }
}

export default function InsuranceScreen() {
  const { '*': wildcard } = useParams()
  const navigate = useNavigate()
  const { session, userProfile } = useAuth()
  const token = session?.access_token ?? null
  const { activeCompanyId } = useActiveCompany()
  const liveSignal = useFleetLive()
  const canCreate = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('fleet.insurance.create'))

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
          title="Seguros"
          description="Polizas de seguro vigentes y vencidas de la flota."
          actions={
            canCreate && (
              <Button onClick={() => navigate(`${BASE_PATH}/new`)}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva poliza
              </Button>
            )
          }
        />
      )}
      <RunlyCrudView
        tableBlueprint={INSURANCE_TABLE}
        formBlueprint={INSURANCE_FORM}
        detailBlueprint={INSURANCE_DETAIL}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={API_BASE}
        refreshSignal={liveSignal}
        initialMode={initialMode}
        recordId={recordId}
        onNavigate={handleNavigate}
        componentRegistry={componentRegistry}
        suppressToolbarCreate
        showEmptyCreate={canCreate}
      />
    </div>
  )
}
