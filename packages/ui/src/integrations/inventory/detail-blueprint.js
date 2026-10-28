import { ACQUISITION_ORIGIN_OPTIONS, ITEM_STATUSES } from './constants.js'
import { ADMIN_STATUSES } from './admin-status.js'

export const INVENTORY_ITEM_DETAIL = {
  key: 'inventory.item.detail',
  kind: 'DETAIL',
  schema: {
    entity: 'invItem',
    component: 'RunlyDetail',
    apiPath: '/inventory/items',
    layout: 'two-column',
    // Double click on any displayed value copies it (CopyOnDoubleClick).
    copyOnDoubleClick: true,
    hero: {
      titleField: 'name',
      // Tipo / Marca / Modelo are chips; identifiers and state live in the strip.
      subtitleFields: [],
      // Disponibilidad next to the title; the administrative Estado is the
      // first, emphasized KPI below.
      statusField: 'status',
      statusOptions: ITEM_STATUSES,
      imageDocsPath: '/inventory/items/:id/files',
      fallbackIcon: 'Package',
      metaChips: [
        { field: 'categoryName', label: 'Tipo', icon: 'Layers' },
        { field: 'brandName', label: 'Marca', icon: 'Tag' },
        { field: 'model', label: 'Modelo', icon: 'Package' },
      ],
    },
    kpis: [
      { label: 'Estado', field: 'adminStatus', type: 'select', options: ADMIN_STATUSES, emphasis: true, icon: 'ClipboardList' },
      { label: 'Condición', field: 'conditionName', icon: 'Activity' },
      { label: 'Asignado a', field: 'assignedToName', icon: 'UserCheck' },
      { label: 'Folio', field: 'folio', icon: 'Hash', copyable: true, prominent: true, emptyLabel: 'Sin folio' },
      { label: 'Número de serie', field: 'serialNumber', icon: 'Barcode', copyable: true, prominent: true, emptyLabel: 'Sin número de serie' },
      { label: 'Número de activo', field: 'assetTag', icon: 'Hash', copyable: true, prominent: true, emptyLabel: 'Sin número de activo' },
    ],
    sections: [
      {
        id: 'identification',
        label: 'Identificación',
        icon: 'IdCard',
        column: 'main',
        columns: 2,
        fields: [
          // Folder path ("Padre / Hijo" or "General"). The host supplies areaPath, areaFilterValue
          // (area id or "__none__") and hasAreas, and adds the "Mover de área" button via fieldActions.
          { field: 'areaPath', label: 'Área', icon: 'Folder', filterBy: { param: 'areaId', valueField: 'areaFilterValue' }, visibleWhen: { field: 'hasAreas', truthy: true } },
          { field: 'folio', label: 'Folio', icon: 'Hash', filterBy: { param: 'folio' } },
          { field: 'model', label: 'Modelo', icon: 'Package', filterBy: { param: 'model' } },
          { field: 'categoryName', label: 'Tipo', icon: 'Layers', filterBy: { param: 'categoryId', valueField: 'categoryId' } },
          { field: 'brandName', label: 'Marca', icon: 'Tag', filterBy: { param: 'brandId', valueField: 'brandId' } },
          { field: 'serialNumber', label: 'Número de serie', icon: 'Barcode', filterBy: { param: 'serialNumber' } },
          { field: 'assetTag', label: 'Número de activo', icon: 'Hash', filterBy: { param: 'assetTag' } },
          { field: 'partNumber', label: 'Número de parte', icon: 'Hash', filterBy: { param: 'partNumber' } },
          // Related Compras documents (EntityRelation); only for users who can read Compras.
          { field: 'purchaseOrderLink', label: 'Orden de compra', type: 'document-link', icon: 'ClipboardList', emptyLabel: 'Sin orden de compra', visibleWhen: { field: 'canReadPurchases', truthy: true } },
          { field: 'purchaseInvoiceLink', label: 'Factura', type: 'document-link', icon: 'ReceiptText', emptyLabel: 'Sin factura', visibleWhen: { field: 'canReadPurchases', truthy: true } },
        ],
      },
      {
        label: 'Ubicación',
        icon: 'MapPin',
        column: 'main',
        columns: 2,
        fields: [
          { field: 'locationName', label: 'Ubicación', icon: 'MapPin', filterBy: { param: 'locationId', valueField: 'locationId' } },
          { field: 'conditionName', label: 'Condición', icon: 'Activity', filterBy: { param: 'conditionId', valueField: 'conditionId' } },
          { field: 'assignedAt', label: 'Fecha de asignación', type: 'date', icon: 'CalendarDays' },
        ],
      },
      {
        label: 'Adquisición y garantía',
        icon: 'ShieldCheck',
        column: 'main',
        columns: 2,
        fields: [
          { field: 'acquisitionOrigin', label: 'Origen de adquisición', type: 'select', options: ACQUISITION_ORIGIN_OPTIONS, icon: 'Receipt' },
          { field: 'warrantyExpiry', label: 'Vencimiento de garantía', type: 'date', icon: 'CalendarDays' },
          { field: 'warrantyNotes', label: 'Notas de garantía', type: 'markdown', icon: 'FileText' },
        ],
      },
      {
        // Main column: purchase documents read better wide, and keeping them
        // out of the aside balances both column heights.
        id: 'purchases',
        type: 'component',
        label: 'Compras relacionadas',
        icon: 'ShoppingCart',
        column: 'main',
        component: 'runly.purchases:InventoryPurchaseSection',
      },
      {
        // Read-only pre-Compras purchase data; hidden when the item has none
        // (the API computes hasLegacyPurchaseData).
        id: 'legacy-purchase',
        label: 'Datos de compra heredados',
        icon: 'History',
        column: 'main',
        columns: 2,
        collapsible: true,
        defaultCollapsed: true,
        visibleWhen: { field: 'hasLegacyPurchaseData', truthy: true },
        fields: [
          { field: 'purchaseDate', label: 'Fecha de compra', type: 'date', icon: 'CalendarDays' },
          { field: 'purchasePrice', label: 'Precio de compra', type: 'currency', icon: 'Tag' },
          { field: 'vendorName', label: 'Proveedor', icon: 'Building2' },
          { field: 'invoiceNumber', label: 'Número de factura', icon: 'Hash' },
        ],
      },
      {
        id: 'custom-fields',
        type: 'component',
        label: 'Campos personalizados',
        icon: 'SlidersHorizontal',
        column: 'main',
        visibleWhen: { field: 'hasCustomValues', truthy: true },
        component: 'runly.inventory:CustomFieldsSection',
      },
      {
        label: 'Notas',
        icon: 'StickyNote',
        column: 'main',
        fields: [{ field: 'notes', label: 'Notas', type: 'markdown', icon: 'FileText' }],
      },
      {
        id: 'attachments',
        type: 'attachments',
        label: 'Archivos',
        icon: 'Paperclip',
        // Top of the right column on desktop; right after Identificación on mobile.
        column: 'aside',
        mobileAfter: 'identification',
        attachments: {
          listPath: '/inventory/items/:id/files',
          addPath: '/inventory/items/:id/files',
          removePath: '/inventory/items/:id/files/:docId',
          coverPath: '/inventory/items/:id/files/:docId/cover',
          reorderPath: '/inventory/items/:id/files/reorder',
          upload: { endpoint: '/files/upload', moduleKey: 'runly.inventory', entityType: 'InvItem' },
          signedUrl: { endpointTemplate: '/files/:fileId/signed-url' },
          fields: { fileAssetId: 'fileAssetId' },
        },
      },
      {
        // QR preview, label print state and reprint (runly.inventory labels).
        // The ERP sets canReadLabels from inventory.label.read.
        id: 'label',
        type: 'component',
        label: 'Etiqueta / QR',
        icon: 'QrCode',
        column: 'aside',
        visibleWhen: { field: 'canReadLabels', truthy: true },
        component: 'runly.inventory:LabelSection',
      },
      {
        id: 'admin-status',
        type: 'component',
        label: 'Estado del activo',
        icon: 'ClipboardList',
        column: 'aside',
        component: 'runly.inventory:AdminSection',
      },
      {
        id: 'assignment',
        type: 'component',
        label: 'Asignación',
        icon: 'UserCheck',
        column: 'aside',
        component: 'runly.inventory:AssignmentSection',
      },
      {
        id: 'history',
        type: 'component',
        label: 'Actividad',
        icon: 'History',
        column: 'aside',
        component: 'runly.inventory:HistorySection',
      },
      {
        id: 'comments',
        type: 'component',
        label: 'Comentarios',
        icon: 'MessageSquare',
        column: 'aside',
        component: 'runly.inventory:CommentsSection',
      },
    ],
  },
}

export default INVENTORY_ITEM_DETAIL
