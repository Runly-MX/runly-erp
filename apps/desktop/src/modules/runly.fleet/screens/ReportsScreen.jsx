import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RunlyTable, Button, PageHeader, ChipTabs } from '@runly/ui'
import { Plus } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { componentRegistry } from '../../../lib/moduleComponentRegistry'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { useFleetLive } from '../hooks/useFleetLive.js'

const API_BASE = getApiUrl()

const REPORT_TABS = [
  { key: 'maintenance', label: 'Mantenimiento' },
  { key: 'service',     label: 'Servicio'      },
  { key: 'repair',      label: 'Reparación'    },
  { key: 'other',       label: 'Otro'          },
]

const REPORT_TABLES = {
  maintenance: {
    key: 'fleet.reports.maintenance.table',
    kind: 'TABLE',
    schema: {
      entity: 'report',
      component: 'RunlyTable',
      apiPath: '/fleet/reports/maintenance',
      primaryField: 'title',
      searchable: true,
      searchPlaceholder: 'Buscar reportes de mantenimiento...',
      columns: [
        { field: 'folio', label: 'Folio', sortable: true, defaultVisible: false },
        { field: 'title', label: 'Titulo', sortable: true, link: true },
        { field: 'vehicle_plate', label: 'Vehiculo' },
        { field: 'status', label: 'Estado', sortable: true, component: 'runly.fleet:ReportStatusBadge' },
        { field: 'report_date', label: 'Fecha', type: 'date', sortable: true },
        { field: 'total_cost', label: 'Total', type: 'currency', sortable: true, defaultVisible: false },
      ],
      rowActions: [
        { label: 'Ver detalle', permission: 'fleet.reports.read' },
        { label: 'Editar', permission: 'fleet.reports.update' },
        { label: 'Desactivar', permission: 'fleet.reports.delete' },
      ],
    },
  },
  service: {
    key: 'fleet.reports.service.table',
    kind: 'TABLE',
    schema: {
      entity: 'report',
      component: 'RunlyTable',
      apiPath: '/fleet/reports/service',
      primaryField: 'title',
      searchable: true,
      searchPlaceholder: 'Buscar reportes de servicio...',
      columns: [
        { field: 'folio', label: 'Folio', sortable: true, defaultVisible: false },
        { field: 'title', label: 'Titulo', sortable: true, link: true },
        { field: 'vehicle_plate', label: 'Vehiculo' },
        { field: 'status', label: 'Estado', sortable: true, component: 'runly.fleet:ReportStatusBadge' },
        { field: 'report_date', label: 'Fecha', type: 'date', sortable: true },
        { field: 'total_cost', label: 'Total', type: 'currency', sortable: true, defaultVisible: false },
      ],
      rowActions: [
        { label: 'Ver detalle', permission: 'fleet.reports.read' },
        { label: 'Editar', permission: 'fleet.reports.update' },
        { label: 'Desactivar', permission: 'fleet.reports.delete' },
      ],
    },
  },
  repair: {
    key: 'fleet.reports.repair.table',
    kind: 'TABLE',
    schema: {
      entity: 'report',
      component: 'RunlyTable',
      apiPath: '/fleet/reports/repair',
      primaryField: 'title',
      searchable: true,
      searchPlaceholder: 'Buscar reportes de reparacion...',
      columns: [
        { field: 'folio', label: 'Folio', sortable: true, defaultVisible: false },
        { field: 'title', label: 'Titulo', sortable: true, link: true },
        { field: 'vehicle_plate', label: 'Vehiculo' },
        { field: 'repair_priority', label: 'Prioridad' },
        { field: 'status', label: 'Estado', sortable: true, component: 'runly.fleet:ReportStatusBadge' },
        { field: 'report_date', label: 'Fecha', type: 'date', sortable: true },
        { field: 'total_cost', label: 'Total', type: 'currency', sortable: true, defaultVisible: false },
      ],
      rowActions: [
        { label: 'Ver detalle', permission: 'fleet.reports.read' },
        { label: 'Editar', permission: 'fleet.reports.update' },
        { label: 'Desactivar', permission: 'fleet.reports.delete' },
      ],
    },
  },
  other: {
    key: 'fleet.reports.other.table',
    kind: 'TABLE',
    schema: {
      entity: 'report',
      component: 'RunlyTable',
      apiPath: '/fleet/reports/other',
      primaryField: 'title',
      searchable: true,
      searchPlaceholder: 'Buscar reportes de otro tipo...',
      columns: [
        { field: 'folio', label: 'Folio', sortable: true, defaultVisible: false },
        { field: 'title', label: 'Titulo', sortable: true, link: true },
        { field: 'other_category_label', label: 'Categoria', defaultVisible: false },
        { field: 'vehicle_plate', label: 'Vehiculo' },
        { field: 'status', label: 'Estado', sortable: true, component: 'runly.fleet:ReportStatusBadge' },
        { field: 'report_date', label: 'Fecha', type: 'date', sortable: true },
        { field: 'total_cost', label: 'Total', type: 'currency', sortable: true, defaultVisible: false },
      ],
      rowActions: [
        { label: 'Ver detalle', permission: 'fleet.reports.read' },
        { label: 'Editar', permission: 'fleet.reports.update' },
        { label: 'Desactivar', permission: 'fleet.reports.delete' },
      ],
    },
  },
}

const CREATE_LABELS = {
  maintenance: 'Nuevo reporte',
  service: 'Nuevo reporte',
  repair: 'Nuevo reporte',
  other: 'Nuevo reporte',
}

export default function ReportsScreen() {
  const { '*': wildcard } = useParams()
  const navigate = useNavigate()
  const { session, userProfile } = useAuth()
  const canCreate = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('fleet.reports.create'))
  const token = session?.access_token ?? null
  const { activeCompanyId } = useActiveCompany()
  const liveSignal = useFleetLive()

  const reportType = useMemo(() => {
    const segs = String(wildcard ?? '').replace(/^\/+/, '').split('/')
    const found = segs.find((s) => REPORT_TABS.some((t) => t.key === s))
    return found ?? 'maintenance'
  }, [wildcard])

  const currentBlueprint = useMemo(() => {
    const base = REPORT_TABLES[reportType]
    return {
      ...base,
      schema: {
        ...base.schema,
        emptyState: {
          icon: 'ClipboardList',
          title: 'Aún no hay reportes de este tipo',
          message: 'Registra el primero para llevar el historial de la unidad. Si indicas la fecha del próximo servicio, se agrega al calendario.',
          actionLabel: CREATE_LABELS[reportType],
        },
      },
    }
  }, [reportType])

  const handleTabChange = useCallback((tab) => {
    navigate(`/app/m/runly.fleet/reports/${tab}`, { replace: true })
  }, [navigate])

  const handleView = useCallback((row) => {
    navigate(`/app/m/runly.fleet/reports/${row.id}`)
  }, [navigate])

  const handleEdit = useCallback((row) => {
    navigate(`/app/m/runly.fleet/reports/${reportType}/${row.id}/edit`)
  }, [navigate, reportType])

  const handleCreate = useCallback(() => {
    navigate(`/app/m/runly.fleet/reports/${reportType}/new`)
  }, [navigate, reportType])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        eyebrow="Runly Fleet"
        title="Reportes de Flota"
        description="Reportes de mantenimiento, servicio y reparacion de la flota."
        actions={
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {CREATE_LABELS[reportType]}
          </Button>
        }
      />
      <ChipTabs
        ariaLabel="Tipos de reporte"
        showDescription={false}
        tabs={REPORT_TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
        value={reportType}
        onChange={handleTabChange}
      />
      <RunlyTable
        blueprint={currentBlueprint}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={API_BASE}
        refreshSignal={liveSignal}
        componentRegistry={componentRegistry}
        onView={handleView}
        onEdit={handleEdit}
        onEmptyCreate={canCreate ? handleCreate : undefined}
      />
    </div>
  )
}
