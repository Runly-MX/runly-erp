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

const DETAIL_BY_TYPE = {
  maintenance: {
    key: 'fleet.reports.maintenance.detail',
    kind: 'DETAIL',
    schema: {
      entity: 'report',
      component: 'RunlyDetail',
      apiPath: '/fleet/reports/maintenance',
      sections: [
        { label: 'Informacion general', columns: 2, fields: [
          { field: 'folio', label: 'Folio', icon: 'Hash' },
          { field: 'title', label: 'Titulo', icon: 'ClipboardList' },
          { field: 'status', label: 'Estado', icon: 'Activity' },
          { field: 'report_type_label', label: 'Tipo', icon: 'Layers' },
          { field: 'report_date', label: 'Fecha', type: 'date', icon: 'CalendarDays' },
          { field: 'odometer_km', label: 'Kilometraje', icon: 'Hash', type: 'number' },
          { field: 'maintenance_subtype', label: 'Subtipo', icon: 'Wrench', type: 'select', options: [
            { label: 'Preventivo', value: 'preventive' }, { label: 'Correctivo', value: 'corrective' },
            { label: 'Inspeccion', value: 'inspection' }, { label: 'Alineacion', value: 'alignment' },
            { label: 'Cambio de aceite', value: 'oil_change' }, { label: 'Llantas', value: 'tire_service' },
            { label: 'Otro', value: 'other' },
          ]},
        ]},
        { id: 'related_vehicle', type: 'relation-card', label: 'Vehiculo', relationCard: { idField: 'vehicle_id', titleField: 'vehicle_plate', subtitleFields: ['vehicle_brand_name', 'vehicle_model_name'], fallbackTitle: 'Vehiculo no disponible', hrefTemplate: '/app/m/runly.fleet/vehicles/:id', icon: 'Truck' } },
        { label: 'Taller y costos', columns: 2, fields: [
          { field: 'is_inhouse_workshop', label: 'Taller propio', type: 'boolean', icon: 'Building2' },
          { field: 'workshop_name', label: 'Taller', icon: 'Library' },
          { field: 'invoice_number', label: 'Factura/Ticket', icon: 'FileText' },
          { field: 'workshop_phone', label: 'Telefono', icon: 'Phone' },
          { field: 'workshop_address', label: 'Direccion', icon: 'Link2' },
          { field: 'labor_cost', label: 'Mano de obra', type: 'currency', icon: 'Tag' },
          { field: 'parts_cost', label: 'Refacciones', type: 'currency', icon: 'Tag' },
          { field: 'total_cost', label: 'Total', type: 'currency', icon: 'Tag' },
        ]},
        { id: 'parts', type: 'relation-list', label: 'Refacciones / Partes', relationList: { apiPath: '/fleet/reports/:id/parts', idField: 'id', titleField: 'name', subtitleFields: ['quantity', 'unit_cost', 'subtotal'], subtitleLabels: ['Cant.', 'P.U.', 'Subtotal'], subtitleTypes: ['integer', 'currency', 'currency'], icon: 'Wrench', emptyMessage: 'No hay refacciones registradas.' } },
        { label: 'Proximo servicio', columns: 2, fields: [{ field: 'next_service_date', label: 'Fecha sugerida', type: 'date', icon: 'CalendarDays' }, { field: 'next_service_odometer', label: 'Kilometraje sugerido', icon: 'Hash', type: 'number' }] },
        { label: 'Observaciones', fields: [{ field: 'notes', label: 'Notas', type: 'markdown', icon: 'FileText' }] },
        { id: 'documents', type: 'documents', label: 'Archivos adjuntos', documents: { listPath: '/fleet/reports/:id/documents', addPath: '/fleet/reports/:id/documents', removePath: '/fleet/reports/:id/documents/:docId', upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetReport' }, fields: { associationId: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type', label: 'label', createdAt: 'created_at', enabled: 'enabled', fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes' }, signedUrl: { endpointTemplate: '/files/:fileId/signed-url' }, permissions: { read: 'fleet.reports.read', create: 'fleet.reports.update', remove: 'fleet.reports.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read' } } },
      ],
      headerActions: [
        { key: 'download_pdf', label: 'Descargar PDF', method: 'GET', pathTemplate: '/fleet/reports/:id/pdf', download: true, downloadFileName: 'reporte-flota.pdf', refreshAfter: false, variant: 'outline', visibleWhen: { field: 'status', equals: 'finalized' } },
        { key: 'regenerate_pdf', label: 'Regenerar PDF', method: 'GET', pathTemplate: '/fleet/reports/:id/pdf', refreshAfter: false, variant: 'outline', visibleWhen: { field: 'status', equals: 'finalized' } },
        { key: 'finalize', label: 'Finalizar', method: 'POST', pathTemplate: '/fleet/reports/:id/finalize', visibleWhen: { field: 'status', equals: 'draft' }, variant: 'default' },
        { key: 'reopen', label: 'Reabrir', method: 'POST', pathTemplate: '/fleet/reports/:id/reopen', visibleWhen: { field: 'status', equals: 'finalized' }, variant: 'outline' },
      ],
      actions: [{ label: 'Editar', permission: 'fleet.reports.update' }],
    },
  },
  service: {
    key: 'fleet.reports.service.detail',
    kind: 'DETAIL',
    schema: {
      entity: 'report',
      component: 'RunlyDetail',
      apiPath: '/fleet/reports/service',
      sections: [
        { label: 'Informacion general', columns: 2, fields: [{ field: 'folio', label: 'Folio', icon: 'Hash' }, { field: 'title', label: 'Titulo', icon: 'ClipboardList' }, { field: 'status', label: 'Estado', icon: 'Activity' }, { field: 'report_type_label', label: 'Tipo', icon: 'Layers' }, { field: 'report_date', label: 'Fecha', type: 'date', icon: 'CalendarDays' }, { field: 'odometer_km', label: 'Kilometraje', icon: 'Hash', type: 'number' }, { field: 'service_subtype', label: 'Subtipo', icon: 'Wrench', type: 'select', options: [{ label: 'General', value: 'general' }, { label: 'Diagnostico', value: 'diagnostic' }, { label: 'Limpieza', value: 'cleaning' }, { label: 'Electrico', value: 'electrical' }, { label: 'Otro', value: 'other' }] }] },
        { id: 'related_vehicle', type: 'relation-card', label: 'Vehiculo', relationCard: { idField: 'vehicle_id', titleField: 'vehicle_plate', subtitleFields: ['vehicle_brand_name', 'vehicle_model_name'], fallbackTitle: 'Vehiculo no disponible', hrefTemplate: '/app/m/runly.fleet/vehicles/:id', icon: 'Truck' } },
        { label: 'Taller y costos', columns: 2, fields: [{ field: 'is_inhouse_workshop', label: 'Taller propio', type: 'boolean', icon: 'Building2' }, { field: 'workshop_name', label: 'Taller', icon: 'Library' }, { field: 'invoice_number', label: 'Factura/Ticket', icon: 'FileText' }, { field: 'workshop_phone', label: 'Telefono', icon: 'Phone' }, { field: 'workshop_address', label: 'Direccion', icon: 'Link2' }, { field: 'labor_cost', label: 'Mano de obra', type: 'currency', icon: 'Tag' }, { field: 'parts_cost', label: 'Refacciones', type: 'currency', icon: 'Tag' }, { field: 'total_cost', label: 'Total', type: 'currency', icon: 'Tag' }] },
        { id: 'parts', type: 'relation-list', label: 'Refacciones / Partes', relationList: { apiPath: '/fleet/reports/:id/parts', idField: 'id', titleField: 'name', subtitleFields: ['quantity', 'unit_cost', 'subtotal'], subtitleLabels: ['Cant.', 'P.U.', 'Subtotal'], subtitleTypes: ['integer', 'currency', 'currency'], icon: 'Wrench', emptyMessage: 'No hay refacciones registradas.' } },
        { label: 'Observaciones', fields: [{ field: 'notes', label: 'Notas', type: 'markdown', icon: 'FileText' }] },
        { id: 'documents', type: 'documents', label: 'Archivos adjuntos', documents: { listPath: '/fleet/reports/:id/documents', addPath: '/fleet/reports/:id/documents', removePath: '/fleet/reports/:id/documents/:docId', upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetReport' }, fields: { associationId: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type', label: 'label', createdAt: 'created_at', enabled: 'enabled', fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes' }, signedUrl: { endpointTemplate: '/files/:fileId/signed-url' }, permissions: { read: 'fleet.reports.read', create: 'fleet.reports.update', remove: 'fleet.reports.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read' } } },
      ],
      headerActions: [
        { key: 'download_pdf', label: 'Descargar PDF', method: 'GET', pathTemplate: '/fleet/reports/:id/pdf', download: true, downloadFileName: 'reporte-flota.pdf', refreshAfter: false, variant: 'outline', visibleWhen: { field: 'status', equals: 'finalized' } },
        { key: 'regenerate_pdf', label: 'Regenerar PDF', method: 'GET', pathTemplate: '/fleet/reports/:id/pdf', refreshAfter: false, variant: 'outline', visibleWhen: { field: 'status', equals: 'finalized' } },
        { key: 'finalize', label: 'Finalizar', method: 'POST', pathTemplate: '/fleet/reports/:id/finalize', visibleWhen: { field: 'status', equals: 'draft' }, variant: 'default' },
        { key: 'reopen', label: 'Reabrir', method: 'POST', pathTemplate: '/fleet/reports/:id/reopen', visibleWhen: { field: 'status', equals: 'finalized' }, variant: 'outline' },
      ],
      actions: [{ label: 'Editar', permission: 'fleet.reports.update' }],
    },
  },
  repair: {
    key: 'fleet.reports.repair.detail',
    kind: 'DETAIL',
    schema: {
      entity: 'report',
      component: 'RunlyDetail',
      apiPath: '/fleet/reports/repair',
      sections: [
        { label: 'Informacion general', columns: 2, fields: [{ field: 'folio', label: 'Folio', icon: 'Hash' }, { field: 'title', label: 'Titulo', icon: 'ClipboardList' }, { field: 'status', label: 'Estado', icon: 'Activity' }, { field: 'report_date', label: 'Fecha', type: 'date', icon: 'CalendarDays' }, { field: 'odometer_km', label: 'Kilometraje', icon: 'Hash', type: 'number' }, { field: 'is_inhouse_workshop', label: 'Taller propio', type: 'boolean', icon: 'Building2' }, { field: 'repair_priority', label: 'Prioridad', icon: 'Tag', type: 'select', options: [{ label: 'Baja', value: 'low' }, { label: 'Normal', value: 'normal' }, { label: 'Alta', value: 'high' }, { label: 'Urgente', value: 'urgent' }] }, { field: 'repair_damage_type', label: 'Tipo de dano', icon: 'Wrench', type: 'select', options: [{ label: 'Mecanico', value: 'mechanical' }, { label: 'Electrico', value: 'electrical' }, { label: 'Carroceria', value: 'body' }, { label: 'Interior', value: 'interior' }, { label: 'Otro', value: 'other' }] }, { field: 'repair_start_date', label: 'Inicio', type: 'date', icon: 'CalendarDays' }, { field: 'repair_completion_date', label: 'Fin', type: 'date', icon: 'CalendarDays' }] },
        { id: 'related_vehicle', type: 'relation-card', label: 'Vehiculo', relationCard: { idField: 'vehicle_id', titleField: 'vehicle_plate', subtitleFields: ['vehicle_brand_name', 'vehicle_model_name'], fallbackTitle: 'Vehiculo no disponible', hrefTemplate: '/app/m/runly.fleet/vehicles/:id', icon: 'Truck' } },
        { label: 'Costos y garantia', columns: 2, fields: [{ field: 'repair_estimated_cost', label: 'Estimado', type: 'currency', icon: 'Tag' }, { field: 'labor_cost', label: 'Mano de obra', type: 'currency', icon: 'Tag' }, { field: 'parts_cost', label: 'Refacciones', type: 'currency', icon: 'Tag' }, { field: 'total_cost', label: 'Total', type: 'currency', icon: 'Tag' }, { field: 'warranty_days', label: 'Dias garantia', icon: 'Hash', type: 'number' }, { field: 'warranty_notes', label: 'Notas garantia', icon: 'FileText' }] },
        { id: 'parts', type: 'relation-list', label: 'Refacciones / Partes', relationList: { apiPath: '/fleet/reports/:id/parts', idField: 'id', titleField: 'name', subtitleFields: ['quantity', 'unit_cost', 'subtotal'], subtitleLabels: ['Cant.', 'P.U.', 'Subtotal'], subtitleTypes: ['integer', 'currency', 'currency'], icon: 'Wrench', emptyMessage: 'No hay refacciones registradas.' } },
        { label: 'Observaciones', fields: [{ field: 'notes', label: 'Notas', type: 'markdown', icon: 'FileText' }] },
        { id: 'documents', type: 'documents', label: 'Archivos adjuntos', documents: { listPath: '/fleet/reports/:id/documents', addPath: '/fleet/reports/:id/documents', removePath: '/fleet/reports/:id/documents/:docId', upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetReport' }, fields: { associationId: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type', label: 'label', createdAt: 'created_at', enabled: 'enabled', fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes' }, signedUrl: { endpointTemplate: '/files/:fileId/signed-url' }, permissions: { read: 'fleet.reports.read', create: 'fleet.reports.update', remove: 'fleet.reports.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read' } } },
      ],
      headerActions: [
        { key: 'download_pdf', label: 'Descargar PDF', method: 'GET', pathTemplate: '/fleet/reports/:id/pdf', download: true, downloadFileName: 'reporte-flota.pdf', refreshAfter: false, variant: 'outline', visibleWhen: { field: 'status', equals: 'finalized' } },
        { key: 'regenerate_pdf', label: 'Regenerar PDF', method: 'GET', pathTemplate: '/fleet/reports/:id/pdf', refreshAfter: false, variant: 'outline', visibleWhen: { field: 'status', equals: 'finalized' } },
        { key: 'finalize', label: 'Finalizar', method: 'POST', pathTemplate: '/fleet/reports/:id/finalize', visibleWhen: { field: 'status', equals: 'draft' }, variant: 'default' },
        { key: 'reopen', label: 'Reabrir', method: 'POST', pathTemplate: '/fleet/reports/:id/reopen', visibleWhen: { field: 'status', equals: 'finalized' }, variant: 'outline' },
      ],
      actions: [{ label: 'Editar', permission: 'fleet.reports.update' }],
    },
  },
  other: {
    key: 'fleet.reports.other.detail',
    kind: 'DETAIL',
    schema: {
      entity: 'report',
      component: 'RunlyDetail',
      apiPath: '/fleet/reports/other',
      sections: [
        { label: 'Informacion general', columns: 2, fields: [{ field: 'folio', label: 'Folio', icon: 'Hash' }, { field: 'title', label: 'Titulo', icon: 'ClipboardList' }, { field: 'status', label: 'Estado', icon: 'Activity' }, { field: 'other_category_label', label: 'Categoria', icon: 'Layers' }, { field: 'report_date', label: 'Fecha', type: 'date', icon: 'CalendarDays' }, { field: 'odometer_km', label: 'Kilometraje', icon: 'Hash', type: 'number' }] },
        { id: 'related_vehicle', type: 'relation-card', label: 'Vehiculo', relationCard: { idField: 'vehicle_id', titleField: 'vehicle_plate', subtitleFields: ['vehicle_brand_name', 'vehicle_model_name'], fallbackTitle: 'Vehiculo no disponible', hrefTemplate: '/app/m/runly.fleet/vehicles/:id', icon: 'Truck' } },
        { label: 'Taller y costos', columns: 2, fields: [{ field: 'is_inhouse_workshop', label: 'Taller propio', type: 'boolean', icon: 'Building2' }, { field: 'workshop_name', label: 'Taller', icon: 'Library' }, { field: 'invoice_number', label: 'Factura/Ticket', icon: 'FileText' }, { field: 'workshop_phone', label: 'Telefono', icon: 'Phone' }, { field: 'workshop_address', label: 'Direccion', icon: 'Link2' }, { field: 'labor_cost', label: 'Mano de obra', type: 'currency', icon: 'Tag' }, { field: 'parts_cost', label: 'Refacciones', type: 'currency', icon: 'Tag' }, { field: 'total_cost', label: 'Total', type: 'currency', icon: 'Tag' }] },
        { id: 'parts', type: 'relation-list', label: 'Refacciones / Partes', relationList: { apiPath: '/fleet/reports/:id/parts', idField: 'id', titleField: 'name', subtitleFields: ['quantity', 'unit_cost', 'subtotal'], subtitleLabels: ['Cant.', 'P.U.', 'Subtotal'], subtitleTypes: ['integer', 'currency', 'currency'], icon: 'Wrench', emptyMessage: 'No hay refacciones registradas.' } },
        { label: 'Observaciones', fields: [{ field: 'notes', label: 'Notas', type: 'markdown', icon: 'FileText' }] },
        { id: 'documents', type: 'documents', label: 'Archivos adjuntos', documents: { listPath: '/fleet/reports/:id/documents', addPath: '/fleet/reports/:id/documents', removePath: '/fleet/reports/:id/documents/:docId', upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetReport' }, fields: { associationId: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type', label: 'label', createdAt: 'created_at', enabled: 'enabled', fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes' }, signedUrl: { endpointTemplate: '/files/:fileId/signed-url' }, permissions: { read: 'fleet.reports.read', create: 'fleet.reports.update', remove: 'fleet.reports.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read' } } },
      ],
      headerActions: [
        { key: 'download_pdf', label: 'Descargar PDF', method: 'GET', pathTemplate: '/fleet/reports/:id/pdf', download: true, downloadFileName: 'reporte-flota.pdf', refreshAfter: false, variant: 'outline', visibleWhen: { field: 'status', equals: 'finalized' } },
        { key: 'regenerate_pdf', label: 'Regenerar PDF', method: 'GET', pathTemplate: '/fleet/reports/:id/pdf', refreshAfter: false, variant: 'outline', visibleWhen: { field: 'status', equals: 'finalized' } },
        { key: 'finalize', label: 'Finalizar', method: 'POST', pathTemplate: '/fleet/reports/:id/finalize', visibleWhen: { field: 'status', equals: 'draft' }, variant: 'default' },
        { key: 'reopen', label: 'Reabrir', method: 'POST', pathTemplate: '/fleet/reports/:id/reopen', visibleWhen: { field: 'status', equals: 'finalized' }, variant: 'outline' },
      ],
      actions: [{ label: 'Editar', permission: 'fleet.reports.update' }],
    },
  },
}

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
    queryKey: ['fleet-report-type', recordId, token],
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
