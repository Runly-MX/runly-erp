import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RunlyCrudView } from '@runly/ui'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { componentRegistry } from '../../../lib/moduleComponentRegistry'
import { runly } from '../../../lib/runly'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { useFleetLive } from '../hooks/useFleetLive.js'

const API_BASE = getApiUrl()

const REPORT_TABLE_STUB = {
  key: 'fleet.reports.stub',
  kind: 'TABLE',
  schema: { entity: 'report', apiPath: '/fleet/reports', columns: [], emptyState: { message: '' } },
}

// Page mode comes from the form blueprint; this stub keeps the detail a full
// page instead of a side sheet (editing lives in ReportFormPage).
const REPORT_FORM_STUB = {
  key: 'fleet.reports.form.stub',
  kind: 'FORM',
  schema: { entity: 'report', apiPath: '/fleet/reports', formMode: 'page', sections: [] },
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Borrador', color: '#d97706' },
  { value: 'finalized', label: 'Finalizado', color: '#059669' },
]

const TYPE_ICONS = { maintenance: 'Wrench', service: 'ClipboardCheck', repair: 'Hammer', other: 'ClipboardList' }

const MAINTENANCE_SUBTYPES = [
  { label: 'Preventivo', value: 'preventive' }, { label: 'Correctivo', value: 'corrective' },
  { label: 'Inspeccion', value: 'inspection' }, { label: 'Alineacion', value: 'alignment' },
  { label: 'Cambio de aceite', value: 'oil_change' }, { label: 'Llantas', value: 'tire_service' },
  { label: 'Otro', value: 'other' },
]
const SERVICE_SUBTYPES = [
  { label: 'General', value: 'general' }, { label: 'Diagnostico', value: 'diagnostic' },
  { label: 'Limpieza', value: 'cleaning' }, { label: 'Electrico', value: 'electrical' }, { label: 'Otro', value: 'other' },
]
const REPAIR_PRIORITIES = [
  { label: 'Baja', value: 'low' }, { label: 'Normal', value: 'normal' },
  { label: 'Alta', value: 'high' }, { label: 'Urgente', value: 'urgent' },
]
const REPAIR_DAMAGE = [
  { label: 'Mecanico', value: 'mechanical' }, { label: 'Electrico', value: 'electrical' },
  { label: 'Carroceria', value: 'body' }, { label: 'Interior', value: 'interior' }, { label: 'Otro', value: 'other' },
]

const costFields = [
  { field: 'labor_cost', label: 'Mano de obra', type: 'currency', icon: 'Wrench' },
  { field: 'parts_cost', label: 'Refacciones', type: 'currency', icon: 'Package' },
  { field: 'total_cost', label: 'Total', type: 'currency', icon: 'Banknote' },
]

const workshopFields = [
  { field: 'is_inhouse_workshop', label: 'Taller propio', type: 'boolean', icon: 'Building2' },
  { field: 'workshop_name', label: 'Taller', icon: 'Library' },
  { field: 'invoice_number', label: 'Factura / ticket', icon: 'FileText' },
  { field: 'workshop_phone', label: 'Telefono', icon: 'Phone' },
  { field: 'workshop_address', label: 'Direccion', icon: 'MapPin' },
]

const documentsSection = {
  id: 'documents',
  type: 'documents',
  label: 'Archivos adjuntos',
  column: 'aside',
  documents: {
    listPath: '/fleet/reports/:id/documents',
    addPath: '/fleet/reports/:id/documents',
    removePath: '/fleet/reports/:id/documents/:docId',
    upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetReport' },
    fields: {
      associationId: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type', label: 'label',
      createdAt: 'created_at', enabled: 'enabled', fileAsset: 'file_asset',
      fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes',
    },
    signedUrl: { endpointTemplate: '/files/:fileId/signed-url' },
    permissions: {
      read: 'fleet.reports.read', create: 'fleet.reports.update', remove: 'fleet.reports.update',
      fileUpload: 'files.assets.create', fileRead: 'files.assets.read',
    },
  },
}

const vehicleSection = {
  id: 'related_vehicle',
  type: 'relation-card',
  label: 'Vehiculo',
  column: 'aside',
  relationCard: {
    idField: 'vehicle_id',
    titleField: 'vehicle_plate',
    subtitleFields: ['vehicle_brand_name', 'vehicle_model_name'],
    fallbackTitle: 'Vehiculo no disponible',
    hrefTemplate: '/app/m/runly.fleet/vehicles/:id',
    icon: 'Truck',
  },
}

const partsSection = {
  id: 'parts',
  type: 'relation-list',
  label: 'Refacciones y partes',
  column: 'main',
  relationList: {
    apiPath: '/fleet/reports/:id/parts',
    idField: 'id',
    titleField: 'name',
    subtitleFields: ['quantity', 'unit_cost', 'subtotal'],
    subtitleLabels: ['Cant.', 'P.U.', 'Subtotal'],
    subtitleTypes: ['integer', 'currency', 'currency'],
    icon: 'Package',
    emptyMessage: 'No hay refacciones registradas.',
  },
}

const notesSection = {
  label: 'Observaciones',
  column: 'main',
  fields: [{ field: 'notes', label: 'Notas', type: 'markdown', icon: 'FileText' }],
}

const headerActions = [
  { key: 'download_pdf', label: 'Descargar PDF', method: 'GET', pathTemplate: '/fleet/reports/:id/pdf', download: true, downloadFileName: 'reporte-flota.pdf', refreshAfter: false, variant: 'outline', visibleWhen: { field: 'status', equals: 'finalized' } },
  { key: 'finalize', label: 'Finalizar', method: 'POST', pathTemplate: '/fleet/reports/:id/finalize', visibleWhen: { field: 'status', equals: 'draft' }, variant: 'default' },
  { key: 'reopen', label: 'Reabrir', method: 'POST', pathTemplate: '/fleet/reports/:id/reopen', visibleWhen: { field: 'status', equals: 'finalized' }, variant: 'outline' },
]

// Per-type pieces; everything else (hero, KPIs, vehicle card, parts, files,
// actions) is shared so the four reports look and behave the same.
const TYPE_CONFIG = {
  maintenance: {
    kpiExtra: { label: 'Proximo servicio', field: 'next_service_date', type: 'date', icon: 'CalendarClock' },
    chips: [],
    general: [
      { field: 'maintenance_subtype', label: 'Subtipo', icon: 'Wrench', type: 'select', options: MAINTENANCE_SUBTYPES },
    ],
    extraSections: [
      {
        label: 'Proximo servicio',
        column: 'main',
        columns: 2,
        fields: [
          { field: 'next_service_date', label: 'Fecha sugerida', type: 'date', icon: 'CalendarDays' },
          { field: 'next_service_odometer', label: 'Kilometraje sugerido', type: 'number', icon: 'Gauge' },
        ],
      },
    ],
    costs: { label: 'Taller y costos', fields: [...workshopFields, ...costFields] },
  },
  service: {
    kpiExtra: { label: 'Kilometraje', field: 'odometer_km', type: 'number', icon: 'Gauge' },
    chips: [],
    general: [{ field: 'service_subtype', label: 'Subtipo', icon: 'Wrench', type: 'select', options: SERVICE_SUBTYPES }],
    extraSections: [],
    costs: { label: 'Taller y costos', fields: [...workshopFields, ...costFields] },
  },
  repair: {
    kpiExtra: { label: 'Estimado', field: 'repair_estimated_cost', type: 'currency', icon: 'Calculator' },
    chips: [],
    general: [
      { field: 'repair_priority', label: 'Prioridad', icon: 'Flag', type: 'select', options: REPAIR_PRIORITIES },
      { field: 'repair_damage_type', label: 'Tipo de dano', icon: 'Wrench', type: 'select', options: REPAIR_DAMAGE },
      { field: 'repair_start_date', label: 'Inicio', type: 'date', icon: 'CalendarDays' },
      { field: 'repair_completion_date', label: 'Fin', type: 'date', icon: 'CalendarCheck' },
    ],
    extraSections: [
      {
        label: 'Garantia',
        column: 'main',
        columns: 2,
        fields: [
          { field: 'warranty_days', label: 'Dias de garantia', type: 'number', icon: 'ShieldCheck' },
          { field: 'warranty_notes', label: 'Notas de garantia', icon: 'FileText' },
        ],
      },
    ],
    costs: { label: 'Taller y costos', fields: [...workshopFields, { field: 'repair_estimated_cost', label: 'Estimado', type: 'currency', icon: 'Calculator' }, ...costFields] },
  },
  other: {
    kpiExtra: { label: 'Kilometraje', field: 'odometer_km', type: 'number', icon: 'Gauge' },
    chips: [{ field: 'other_category_label', label: 'Categoria', icon: 'Layers' }],
    general: [{ field: 'other_category_label', label: 'Categoria', icon: 'Layers' }],
    extraSections: [],
    costs: { label: 'Taller y costos', fields: [...workshopFields, ...costFields] },
  },
}

function buildDetail(reportType) {
  const cfg = TYPE_CONFIG[reportType]
  return {
    key: `fleet.reports.${reportType}.detail`,
    kind: 'DETAIL',
    schema: {
      entity: 'report',
      component: 'RunlyDetail',
      apiPath: `/fleet/reports/${reportType}`,
      layout: 'two-column',
      hero: {
        titleField: 'title',
        subtitleFields: ['folio', 'vehicle_plate', 'report_type_label'],
        statusField: 'status',
        statusOptions: STATUS_OPTIONS,
        fallbackIcon: TYPE_ICONS[reportType],
        metaChips: cfg.chips,
      },
      kpis: [
        { label: 'Total', field: 'total_cost', type: 'currency', icon: 'Banknote' },
        { label: 'Mano de obra', field: 'labor_cost', type: 'currency', icon: 'Wrench' },
        { label: 'Refacciones', field: 'parts_cost', type: 'currency', icon: 'Package' },
        cfg.kpiExtra,
      ],
      sections: [
        {
          label: 'Informacion general',
          column: 'main',
          columns: 2,
          fields: [
            { field: 'folio', label: 'Folio', icon: 'Hash' },
            { field: 'report_date', label: 'Fecha', type: 'date', icon: 'CalendarDays' },
            { field: 'odometer_km', label: 'Kilometraje', type: 'number', icon: 'Gauge' },
            ...cfg.general,
          ],
        },
        { label: cfg.costs.label, column: 'main', columns: 2, fields: cfg.costs.fields },
        partsSection,
        ...cfg.extraSections,
        notesSection,
        vehicleSection,
        documentsSection,
      ],
      headerActions,
      actions: [{ label: 'Editar', permission: 'fleet.reports.update' }],
    },
  }
}

const DETAIL_BY_TYPE = Object.fromEntries(Object.keys(TYPE_CONFIG).map((type) => [type, buildDetail(type)]))

export default function ReportDetailScreen() {
  const { '*': wildcard } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const { activeCompanyId } = useActiveCompany()
  const liveSignal = useFleetLive()

  const recordId = useMemo(() => {
    // wildcard: 'reports/:id'
    const segs = String(wildcard ?? '').replace(/^\/+/, '').split('/').filter(Boolean)
    return segs[1] ?? null
  }, [wildcard])

  const { data: reportData } = useQuery({
    queryKey: ['fleet', 'report-type', recordId, token],
    queryFn: () => runly.fleet.getReport(recordId, token).catch(() => null),
    enabled: Boolean(recordId && token),
  })

  const reportType = reportData?.data?.report_type ?? reportData?.report_type ?? 'maintenance'
  const detailBlueprint = DETAIL_BY_TYPE[reportType] ?? DETAIL_BY_TYPE.maintenance

  const handleNavigate = useCallback(({ mode }) => {
    if (mode === 'list') {
      navigate(`/app/m/runly.fleet/reports/${reportType}`, { replace: true })
      return
    }
    if (mode === 'edit' && recordId) {
      navigate(`/app/m/runly.fleet/reports/${reportType}/${recordId}/edit`)
    }
  }, [navigate, reportType, recordId])

  if (!recordId) return null

  return (
    <div className="px-4 pb-6 md:px-6 min-h-dvh">
      <RunlyCrudView
        tableBlueprint={REPORT_TABLE_STUB}
        formBlueprint={REPORT_FORM_STUB}
        detailBlueprint={detailBlueprint}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={API_BASE}
        refreshSignal={liveSignal}
        initialMode="detail"
        recordId={recordId}
        onNavigate={handleNavigate}
        componentRegistry={componentRegistry}
      />
    </div>
  )
}
