import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RunlyCrudView } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { componentRegistry } from '../../../lib/moduleComponentRegistry'
import { getApiUrl } from '../../../lib/runtimeConfig.js'

const API_BASE = getApiUrl()

const REPORT_TABLE_STUB = {
  key: 'fleet.reports.stub',
  kind: 'TABLE',
  schema: { entity: 'report', apiPath: '/fleet/reports', columns: [], emptyState: { message: '' } },
}

const KNOWN_TYPES = ['maintenance', 'service', 'repair', 'other']

const FORMS_BY_TYPE = {
  maintenance: {
    key: 'fleet.reports.maintenance.form',
    kind: 'FORM',
    schema: {
      entity: 'report',
      component: 'RunlyForm',
      apiPath: '/fleet/reports/maintenance',
      formMode: 'page',
      title: 'Nuevo Reporte de Mantenimiento',
      submitLabel: 'Finalizar reporte',
      cancelLabel: 'Cancelar',
      sections: [
        { id: 'vehicle', label: 'Vehiculo', icon: 'Wrench', description: 'Selecciona el vehiculo al que se aplico el mantenimiento.', collapsible: true, defaultCollapsed: false, columns: 1, fields: [{ field: 'vehicle_id', label: 'Seleccionar vehiculo', type: 'relation', required: true, relation: { apiPath: '/fleet/vehicles', labelField: ['plate', 'vehicle_model_name'], labelSeparator: ' · ', clearable: false, disabledField: 'enabled', searchParam: 'search', displayFields: { badge: 'full_economic_number', title: 'vehicle_model_name', subtitle: ['plate', 'vehicle_type_name', 'vehicle_brand_name'] } } }] },
        { id: 'service_data', label: 'Datos del Mantenimiento', icon: 'CalendarDays', collapsible: true, defaultCollapsed: false, columns: 2, fields: [
          { field: 'title', label: 'Titulo del servicio', type: 'text', required: true },
          { field: 'maintenance_subtype', label: 'Tipo de mantenimiento', type: 'select', required: true, options: [
            { label: 'Preventivo', value: 'preventive' }, { label: 'Correctivo', value: 'corrective' },
            { label: 'Inspeccion', value: 'inspection' }, { label: 'Alineacion', value: 'alignment' },
            { label: 'Cambio de aceite', value: 'oil_change' }, { label: 'Llantas', value: 'tire_service' },
            { label: 'Otro', value: 'other' },
          ]},
          { field: 'report_date', label: 'Fecha del servicio', type: 'date', required: true },
          { field: 'odometer_km', label: 'Kilometraje', type: 'number' },
        ]},
        { id: 'workshop', label: 'Informacion del Taller', icon: 'Building2', description: 'Datos del proveedor que realizo el trabajo.', collapsible: true, defaultCollapsed: false, columns: 2, fields: [
          { field: 'is_inhouse_workshop', label: 'Taller propio', type: 'boolean', default: true, hint: 'Si activas esta opcion, los datos del taller quedan como no requeridos.' },
          { field: 'workshop_name', label: 'Nombre del taller', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } },
          { field: 'workshop_phone', label: 'Telefono', type: 'phone', visibleWhen: { field: 'is_inhouse_workshop', equals: false } },
          { field: 'workshop_address', label: 'Direccion', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } },
          { field: 'invoice_number', label: 'No. de factura/ticket', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } },
        ]},
        { id: 'parts', type: 'parts-editor', label: 'Refacciones / Partes', icon: 'Package', description: 'Agrega piezas, cantidades y costo unitario.', collapsible: true, defaultCollapsed: false },
        { id: 'costs', label: 'Resumen de Costos', icon: 'BadgeDollarSign', collapsible: true, defaultCollapsed: false, columns: 3, fields: [{ field: 'labor_cost', label: 'Mano de obra', type: 'currency' }, { field: 'parts_cost', label: 'Costo de refacciones (calculado automaticamente)', type: 'currency', readonly: true }, { field: 'total_cost', label: 'Costo final total (mano de obra + partes)', type: 'currency', readonly: true }] },
        { id: 'notes', label: 'Observaciones', icon: 'FileText', collapsible: true, defaultCollapsed: false, columns: 1, fields: [{ field: 'notes', label: 'Descripcion / notas', type: 'markdown' }] },
        { id: 'next_service', label: 'Proximo Servicio', icon: 'CalendarClock', description: 'Indica fecha o kilometraje sugerido para el siguiente mantenimiento.', collapsible: true, defaultCollapsed: false, columns: 2, fields: [{ field: 'next_service_date', label: 'Fecha sugerida', type: 'date' }, { field: 'next_service_odometer', label: 'Kilometraje sugerido', type: 'number' }] },
        { id: 'attachments', type: 'attachments', label: 'Archivos Adjuntos', icon: 'Paperclip', collapsible: true, defaultCollapsed: false, attachments: { createMode: 'stage-until-parent-create', editMode: 'upload-immediately', listPath: '/fleet/reports/:id/documents', addPath: '/fleet/reports/:id/documents', removePath: '/fleet/reports/:id/documents/:docId', upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetReport' }, signedUrl: { endpointTemplate: '/files/:fileId/signed-url' }, fields: { id: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type', label: 'label', createdAt: 'created_at', enabled: 'enabled', fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes' }, permissions: { read: 'fleet.reports.read', create: 'fleet.reports.update', remove: 'fleet.reports.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read' }, limits: { maxFiles: 20, maxSizeMB: 10, allowMultiple: true } } },
      ],
    },
  },
  service: {
    key: 'fleet.reports.service.form',
    kind: 'FORM',
    schema: {
      entity: 'report',
      component: 'RunlyForm',
      apiPath: '/fleet/reports/service',
      formMode: 'page',
      title: 'Nuevo Reporte de Servicio',
      submitLabel: 'Finalizar reporte',
      cancelLabel: 'Cancelar',
      sections: [
        { id: 'vehicle', label: 'Vehiculo', icon: 'Wrench', description: 'Selecciona el vehiculo al que se le realizo el servicio.', collapsible: true, defaultCollapsed: false, columns: 1, fields: [{ field: 'vehicle_id', label: 'Seleccionar vehiculo', type: 'relation', required: true, relation: { apiPath: '/fleet/vehicles', labelField: ['plate', 'vehicle_model_name'], labelSeparator: ' · ', clearable: false, disabledField: 'enabled', searchParam: 'search', displayFields: { badge: 'full_economic_number', title: 'vehicle_model_name', subtitle: ['plate', 'vehicle_type_name', 'vehicle_brand_name'] } } }] },
        { id: 'service_data', label: 'Datos del Servicio', icon: 'CalendarDays', collapsible: true, defaultCollapsed: false, columns: 2, fields: [{ field: 'title', label: 'Titulo del servicio', type: 'text', required: true }, { field: 'service_subtype', label: 'Tipo de servicio', type: 'select', required: true, options: [{ label: 'General', value: 'general' }, { label: 'Diagnostico', value: 'diagnostic' }, { label: 'Limpieza', value: 'cleaning' }, { label: 'Electrico', value: 'electrical' }, { label: 'Otro', value: 'other' }] }, { field: 'report_date', label: 'Fecha del servicio', type: 'date', required: true }, { field: 'odometer_km', label: 'Kilometraje', type: 'number' }] },
        { id: 'workshop', label: 'Informacion del Taller', icon: 'Building2', description: 'Datos del proveedor.', collapsible: true, defaultCollapsed: false, columns: 2, fields: [{ field: 'is_inhouse_workshop', label: 'Taller propio', type: 'boolean', default: true }, { field: 'workshop_name', label: 'Nombre del taller', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }, { field: 'workshop_phone', label: 'Telefono', type: 'phone', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }, { field: 'workshop_address', label: 'Direccion', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }, { field: 'invoice_number', label: 'No. de factura / ticket', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }] },
        { id: 'parts', type: 'parts-editor', label: 'Refacciones / Partes', icon: 'Package', collapsible: true, defaultCollapsed: false },
        { id: 'costs', label: 'Resumen de Costos', icon: 'BadgeDollarSign', collapsible: true, defaultCollapsed: false, columns: 3, fields: [{ field: 'labor_cost', label: 'Mano de obra', type: 'currency' }, { field: 'parts_cost', label: 'Costo de refacciones (calculado automaticamente)', type: 'currency', readonly: true }, { field: 'total_cost', label: 'Costo final total', type: 'currency', readonly: true }] },
        { id: 'notes', label: 'Observaciones', icon: 'FileText', collapsible: true, defaultCollapsed: false, columns: 1, fields: [{ field: 'notes', label: 'Descripcion / notas', type: 'markdown' }] },
        { id: 'attachments', type: 'attachments', label: 'Archivos Adjuntos', icon: 'Paperclip', collapsible: true, defaultCollapsed: false, attachments: { createMode: 'stage-until-parent-create', editMode: 'upload-immediately', listPath: '/fleet/reports/:id/documents', addPath: '/fleet/reports/:id/documents', removePath: '/fleet/reports/:id/documents/:docId', upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetReport' }, signedUrl: { endpointTemplate: '/files/:fileId/signed-url' }, fields: { id: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type', label: 'label', createdAt: 'created_at', enabled: 'enabled', fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes' }, permissions: { read: 'fleet.reports.read', create: 'fleet.reports.update', remove: 'fleet.reports.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read' }, limits: { maxFiles: 20, maxSizeMB: 10, allowMultiple: true } } },
      ],
    },
  },
  repair: {
    key: 'fleet.reports.repair.form',
    kind: 'FORM',
    schema: {
      entity: 'report',
      component: 'RunlyForm',
      apiPath: '/fleet/reports/repair',
      formMode: 'page',
      title: 'Nuevo Reporte de Reparacion',
      submitLabel: 'Finalizar reparacion',
      cancelLabel: 'Cancelar',
      sections: [
        { id: 'vehicle', label: 'Vehiculo', icon: 'Wrench', description: 'Selecciona el vehiculo afectado por la reparacion.', collapsible: true, defaultCollapsed: false, columns: 1, fields: [{ field: 'vehicle_id', label: 'Seleccionar vehiculo', type: 'relation', required: true, relation: { apiPath: '/fleet/vehicles', labelField: ['plate', 'vehicle_model_name'], labelSeparator: ' · ', clearable: false, disabledField: 'enabled', searchParam: 'search', displayFields: { badge: 'full_economic_number', title: 'vehicle_model_name', subtitle: ['plate', 'vehicle_type_name', 'vehicle_brand_name'] } } }] },
        { id: 'repair_data', label: 'Datos de la Reparacion', icon: 'ShieldAlert', collapsible: true, defaultCollapsed: false, columns: 2, fields: [{ field: 'title', label: 'Titulo / Descripcion del problema', type: 'text', required: true }, { field: 'report_date', label: 'Fecha del reporte', type: 'date', required: true }, { field: 'odometer_km', label: 'Kilometraje', type: 'number' }, { field: 'repair_priority', label: 'Prioridad', type: 'select', required: true, options: [{ label: 'Baja', value: 'low' }, { label: 'Normal', value: 'normal' }, { label: 'Alta', value: 'high' }, { label: 'Urgente', value: 'urgent' }] }, { field: 'repair_damage_type', label: 'Tipo de dano', type: 'select', required: true, options: [{ label: 'Mecanico', value: 'mechanical' }, { label: 'Electrico', value: 'electrical' }, { label: 'Carroceria', value: 'body' }, { label: 'Interior', value: 'interior' }, { label: 'Otro', value: 'other' }] }, { field: 'repair_start_date', label: 'Fecha inicio reparacion', type: 'date', required: true }, { field: 'repair_completion_date', label: 'Fecha finalizacion', type: 'date' }] },
        { id: 'workshop', label: 'Informacion del Taller', icon: 'Building2', collapsible: true, defaultCollapsed: false, columns: 2, fields: [{ field: 'is_inhouse_workshop', label: 'Taller propio', type: 'boolean', default: true }, { field: 'workshop_name', label: 'Nombre del taller', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }, { field: 'workshop_phone', label: 'Telefono', type: 'phone', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }, { field: 'workshop_address', label: 'Direccion', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }, { field: 'invoice_number', label: 'No. de factura / ticket', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }] },
        { id: 'parts', type: 'parts-editor', label: 'Partes Reparadas / Reemplazadas', icon: 'Package', collapsible: true, defaultCollapsed: false },
        { id: 'costs', label: 'Costos', icon: 'BadgeDollarSign', collapsible: true, defaultCollapsed: false, columns: 2, fields: [{ field: 'repair_estimated_cost', label: 'Costo estimado', type: 'currency' }, { field: 'labor_cost', label: 'Mano de obra', type: 'currency' }, { field: 'parts_cost', label: 'Costo de partes (calculado automaticamente)', type: 'currency', readonly: true }, { field: 'total_cost', label: 'Costo final total', type: 'currency', readonly: true }] },
        { id: 'notes', label: 'Descripcion Detallada', icon: 'FileText', collapsible: true, defaultCollapsed: false, columns: 1, fields: [{ field: 'notes', label: 'Descripcion del problema y solucion', type: 'markdown' }] },
        { id: 'warranty', label: 'Garantia', icon: 'ShieldCheck', collapsible: true, defaultCollapsed: false, columns: 2, fields: [{ field: 'warranty_days', label: 'Dias de garantia', type: 'number' }, { field: 'warranty_notes', label: 'Condiciones de garantia', type: 'markdown' }] },
        { id: 'attachments', type: 'attachments', label: 'Archivos Adjuntos', icon: 'Paperclip', collapsible: true, defaultCollapsed: false, attachments: { createMode: 'stage-until-parent-create', editMode: 'upload-immediately', listPath: '/fleet/reports/:id/documents', addPath: '/fleet/reports/:id/documents', removePath: '/fleet/reports/:id/documents/:docId', upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetReport' }, signedUrl: { endpointTemplate: '/files/:fileId/signed-url' }, fields: { id: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type', label: 'label', createdAt: 'created_at', enabled: 'enabled', fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes' }, permissions: { read: 'fleet.reports.read', create: 'fleet.reports.update', remove: 'fleet.reports.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read' }, limits: { maxFiles: 20, maxSizeMB: 10, allowMultiple: true } } },
      ],
    },
  },
  other: {
    key: 'fleet.reports.other.form',
    kind: 'FORM',
    schema: {
      entity: 'report',
      component: 'RunlyForm',
      apiPath: '/fleet/reports/other',
      formMode: 'page',
      title: 'Nuevo Reporte - Otro',
      submitLabel: 'Finalizar reporte',
      cancelLabel: 'Cancelar',
      sections: [
        { id: 'vehicle', label: 'Vehiculo', icon: 'Wrench', collapsible: true, defaultCollapsed: false, columns: 1, fields: [{ field: 'vehicle_id', label: 'Seleccionar vehiculo', type: 'relation', required: true, relation: { apiPath: '/fleet/vehicles', labelField: ['plate', 'vehicle_model_name'], labelSeparator: ' · ', clearable: false, disabledField: 'enabled', searchParam: 'search', displayFields: { badge: 'full_economic_number', title: 'vehicle_model_name', subtitle: ['plate', 'vehicle_type_name', 'vehicle_brand_name'] } } }] },
        { id: 'other_data', label: 'Datos del Reporte', icon: 'ClipboardList', collapsible: true, defaultCollapsed: false, columns: 2, fields: [{ field: 'title', label: 'Titulo del reporte', type: 'text', required: true }, { field: 'other_category_label', label: 'Categoria personalizada', type: 'text', required: true }, { field: 'report_date', label: 'Fecha del reporte', type: 'date', required: true }, { field: 'odometer_km', label: 'Kilometraje', type: 'number' }] },
        { id: 'workshop', label: 'Informacion del Taller', icon: 'Building2', collapsible: true, defaultCollapsed: false, columns: 2, fields: [{ field: 'is_inhouse_workshop', label: 'Taller propio', type: 'boolean', default: true }, { field: 'workshop_name', label: 'Nombre del taller', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }, { field: 'workshop_phone', label: 'Telefono', type: 'phone', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }, { field: 'workshop_address', label: 'Direccion', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }, { field: 'invoice_number', label: 'No. de factura / ticket', type: 'text', visibleWhen: { field: 'is_inhouse_workshop', equals: false } }] },
        { id: 'parts', type: 'parts-editor', label: 'Refacciones / Partes', icon: 'Package', collapsible: true, defaultCollapsed: false },
        { id: 'costs', label: 'Resumen de Costos', icon: 'BadgeDollarSign', collapsible: true, defaultCollapsed: false, columns: 3, fields: [{ field: 'labor_cost', label: 'Mano de obra', type: 'currency' }, { field: 'parts_cost', label: 'Costo de refacciones (calculado automaticamente)', type: 'currency', readonly: true }, { field: 'total_cost', label: 'Costo final total', type: 'currency', readonly: true }] },
        { id: 'notes', label: 'Observaciones', icon: 'FileText', collapsible: true, defaultCollapsed: false, columns: 1, fields: [{ field: 'notes', label: 'Descripcion / notas', type: 'markdown' }] },
        { id: 'attachments', type: 'attachments', label: 'Archivos Adjuntos', icon: 'Paperclip', collapsible: true, defaultCollapsed: false, attachments: { createMode: 'stage-until-parent-create', editMode: 'upload-immediately', listPath: '/fleet/reports/:id/documents', addPath: '/fleet/reports/:id/documents', removePath: '/fleet/reports/:id/documents/:docId', upload: { endpoint: '/files/upload', moduleKey: 'runly.fleet', entityType: 'FleetReport' }, signedUrl: { endpointTemplate: '/files/:fileId/signed-url' }, fields: { id: 'id', fileAssetId: 'file_asset_id', documentType: 'document_type', label: 'label', createdAt: 'created_at', enabled: 'enabled', fileAsset: 'file_asset', fileName: 'originalName', mimeType: 'mimeType', sizeBytes: 'sizeBytes' }, permissions: { read: 'fleet.reports.read', create: 'fleet.reports.update', remove: 'fleet.reports.update', fileUpload: 'files.assets.create', fileRead: 'files.assets.read' }, limits: { maxFiles: 20, maxSizeMB: 10, allowMultiple: true } } },
      ],
    },
  },
}

export default function ReportFormPage() {
  const { '*': wildcard } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const { activeCompanyId } = useActiveCompany()

  const { reportType, recordId, mode } = useMemo(() => {
    // Supported shapes:
    //   reports/<type>/new            -> create
    //   reports/<type>/<id>/edit      -> edit (canonical, keeps the real type in the URL)
    //   reports/<id>/edit             -> legacy edit, falls back to the maintenance form
    const segs = String(wildcard ?? '').replace(/^\/+/, '').split('/').filter(Boolean)
    if (KNOWN_TYPES.includes(segs[1]) && segs[2] === 'new') {
      return { reportType: segs[1], recordId: null, mode: 'create' }
    }
    if (KNOWN_TYPES.includes(segs[1]) && segs[3] === 'edit') {
      return { reportType: segs[1], recordId: segs[2] ?? null, mode: 'edit' }
    }
    if (KNOWN_TYPES.includes(segs[1])) {
      return { reportType: segs[1], recordId: null, mode: 'create' }
    }
    return { reportType: 'maintenance', recordId: segs[1] ?? null, mode: 'edit' }
  }, [wildcard])

  const formBlueprint = FORMS_BY_TYPE[reportType] ?? FORMS_BY_TYPE.maintenance

  const handleNavigate = useCallback(({ mode: nextMode }) => {
    if (nextMode === 'list') {
      navigate(`/app/m/runly.fleet/reports/${reportType}`, { replace: true })
      return
    }
    if (nextMode === 'detail' && recordId) {
      navigate(`/app/m/runly.fleet/reports/${recordId}`, { replace: true })
    }
  }, [navigate, reportType, recordId])

  const handleCreateSuccess = useCallback(() => {
    navigate(`/app/m/runly.fleet/reports/${reportType}`, { replace: true })
  }, [navigate, reportType])

  return (
    <div className="px-4 pb-6 md:px-6 min-h-dvh">
      <RunlyCrudView
        tableBlueprint={REPORT_TABLE_STUB}
        formBlueprint={formBlueprint}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={API_BASE}
        initialMode={mode}
        recordId={recordId}
        onNavigate={handleNavigate}
        onCreateSuccess={handleCreateSuccess}
        componentRegistry={componentRegistry}
      />
    </div>
  )
}
