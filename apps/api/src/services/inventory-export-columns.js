// Column catalog of the inventory export: every item field and relation the
// user can choose. `value(ctx)` reads from a prepared context (the item with
// its includes plus the batch lookups built by inventory-export-service.js).
import { ADMIN_STATUS_LABELS } from './inventory-admin-service.js';
import { reasonText } from './inventory-deregistration-act-pdf.js';

const OPERATIONAL = { available: 'Disponible', assigned: 'Asignado', maintenance: 'Mantenimiento' };
const ORIGINS = { PURCHASE: 'Compra', DONATION: 'Donación', LEASE: 'Arrendamiento', OTHER: 'Otro' };
const personName = (user) => user?.displayName?.trim() || [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || '';

// DATE columns arrive as UTC midnight; timestamps are shown in ISO local-agnostic form.
const day = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const stamp = (value) => (value ? new Date(value).toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' }) : '');

const lastEvent = (item, action) => [...(item.adminEvents ?? [])].reverse().find((e) => e.action === action);

// group order is the order shown in the dialog.
export const EXPORT_GROUPS = [
  { key: 'identity', label: 'Identificación' },
  { key: 'status', label: 'Estado y condición' },
  { key: 'place', label: 'Ubicación y asignación' },
  { key: 'purchase', label: 'Compra y garantía' },
  { key: 'deregistration', label: 'Baja' },
  { key: 'related', label: 'Relaciones' },
  { key: 'media', label: 'Imágenes y archivos' },
  { key: 'audit', label: 'Registro' },
];

// price is kept numeric for Excel; CSV writes it as plain text.
export const EXPORT_COLUMNS = [
  { key: 'assetTag', label: 'Número de activo', group: 'identity', default: true, value: ({ item }) => item.assetTag },
  { key: 'folio', label: 'Folio', group: 'identity', default: true, value: ({ item }) => item.folio },
  { key: 'name', label: 'Nombre', group: 'identity', default: true, value: ({ item }) => item.name },
  { key: 'description', label: 'Descripción', group: 'identity', default: true, value: ({ item }) => item.description },
  { key: 'itemType', label: 'Tipo de activo', group: 'identity', default: true, value: ({ item }) => item.itemType },
  { key: 'category', label: 'Categoría', group: 'identity', default: true, value: ({ item }) => item.category?.name },
  { key: 'brand', label: 'Marca', group: 'identity', default: true, value: ({ item }) => item.brand?.name },
  { key: 'model', label: 'Modelo', group: 'identity', default: true, value: ({ item }) => item.catalogModel?.name ?? item.model },
  { key: 'serialNumber', label: 'Número de serie', group: 'identity', default: true, value: ({ item }) => item.serialNumber },
  { key: 'partNumber', label: 'Número de parte', group: 'identity', default: true, value: ({ item }) => item.partNumber },

  { key: 'adminStatus', label: 'Estado', group: 'status', default: true, value: ({ item }) => ADMIN_STATUS_LABELS[item.adminStatus] ?? item.adminStatus },
  { key: 'status', label: 'Disponibilidad', group: 'status', default: true, value: ({ item }) => OPERATIONAL[item.status] ?? item.status },
  { key: 'condition', label: 'Condición física', group: 'status', default: true, value: ({ item }) => item.condition?.name },
  { key: 'registeredAt', label: 'Fecha de alta', group: 'status', default: true, value: ({ item }) => day(item.registeredAt) },

  { key: 'location', label: 'Ubicación', group: 'place', default: true, value: ({ item }) => item.location?.name },
  { key: 'area', label: 'Área (carpeta)', group: 'place', default: true, value: ({ item, areaPath }) => (item.areaId ? areaPath(item.areaId) : 'General') },
  { key: 'assignedTo', label: 'Asignado a', group: 'place', default: true, value: ({ item }) => [item.assignedTo?.firstName, item.assignedTo?.lastName].filter(Boolean).join(' ') },
  { key: 'assignedEmployeeCode', label: 'Núm. de empleado', group: 'place', default: true, value: ({ item }) => item.assignedTo?.employeeCode },
  { key: 'assignedEmail', label: 'Correo del responsable', group: 'place', default: true, value: ({ item }) => item.assignedTo?.workEmail },
  { key: 'assignedAt', label: 'Fecha de asignación', group: 'place', default: true, value: ({ item }) => stamp(item.assignedAt) },

  { key: 'purchaseDate', label: 'Fecha de compra', group: 'purchase', default: true, value: ({ item }) => day(item.purchaseDate) },
  { key: 'purchasePrice', label: 'Costo de adquisición', group: 'purchase', default: true, numeric: true, value: ({ item }) => (item.purchasePrice === null ? '' : Number(item.purchasePrice)) },
  { key: 'vendorName', label: 'Proveedor', group: 'purchase', default: true, value: ({ item }) => item.vendorName },
  { key: 'invoiceNumber', label: 'Factura', group: 'purchase', default: true, value: ({ item }) => item.invoiceNumber },
  { key: 'acquisitionOrigin', label: 'Origen de adquisición', group: 'purchase', default: true, value: ({ item }) => ORIGINS[item.acquisitionOrigin] ?? item.acquisitionOrigin },
  { key: 'warrantyExpiry', label: 'Vencimiento de garantía', group: 'purchase', default: true, value: ({ item }) => day(item.warrantyExpiry) },
  { key: 'warrantyNotes', label: 'Notas de garantía', group: 'purchase', default: true, value: ({ item }) => item.warrantyNotes },
  { key: 'licenseExpiry', label: 'Vencimiento de licencia', group: 'purchase', default: true, value: ({ item }) => day(item.licenseExpiry) },
  { key: 'licenseSeats', label: 'Licencias (asientos)', group: 'purchase', default: true, value: ({ item }) => item.licenseSeats },

  { key: 'deregisteredAt', label: 'Fecha de baja', group: 'deregistration', default: true, value: ({ item }) => day(item.deregisteredAt) },
  { key: 'deregistrationReason', label: 'Motivo de baja', group: 'deregistration', default: true, value: ({ item }) => (item.deregistrationReason ? reasonText(item.deregistrationReason) : '') },
  { key: 'proposedBy', label: 'Baja propuesta por', group: 'deregistration', default: true, value: ({ item }) => personName(lastEvent(item, 'propose_deregistration')?.actor) },
  { key: 'proposedAt', label: 'Fecha de propuesta de baja', group: 'deregistration', default: true, value: ({ item }) => stamp(lastEvent(item, 'propose_deregistration')?.createdAt) },
  { key: 'proposalComment', label: 'Comentario de la propuesta de baja', group: 'deregistration', default: true, value: ({ item }) => lastEvent(item, 'propose_deregistration')?.comment },
  { key: 'authorizedBy', label: 'Baja autorizada por', group: 'deregistration', default: true, value: ({ item }) => personName(lastEvent(item, 'approve_deregistration')?.actor) },
  { key: 'authorizedAt', label: 'Fecha de autorización de baja', group: 'deregistration', default: true, value: ({ item }) => stamp(lastEvent(item, 'approve_deregistration')?.createdAt) },
  { key: 'authorizationComment', label: 'Comentario de la autorización', group: 'deregistration', default: true, value: ({ item }) => lastEvent(item, 'approve_deregistration')?.comment },
  { key: 'actFolio', label: 'Folio del acta de baja', group: 'deregistration', default: true, value: ({ item, actFolios }) => actFolios.get(lastEvent(item, 'approve_deregistration')?.actId) },

  { key: 'notes', label: 'Notas', group: 'related', default: true, value: ({ item }) => item.notes },
  { key: 'comments', label: 'Comentarios', group: 'related', default: true, value: ({ comments, item }) => comments.get(item.id) },
  { key: 'purchaseDocs', label: 'Órdenes y facturas de compra relacionadas', group: 'related', default: true, value: ({ purchases, item }) => purchases.get(item.id) },
  { key: 'lastCustody', label: 'Último resguardo (folio)', group: 'related', default: true, value: ({ custodies, item }) => custodies.get(item.id) },

  { key: 'images', label: 'Imágenes (enlaces)', group: 'media', default: true, array: true, value: ({ item, images }) => images.get(item.id) ?? [] },
  { key: 'coverImage', label: 'Imagen de portada (enlace)', group: 'media', default: false, value: ({ item, images }) => images.get(item.id)?.[0] },
  { key: 'imageCount', label: 'Núm. de imágenes', group: 'media', default: false, value: ({ item, images }) => (images.get(item.id) ?? []).length },
  { key: 'fileCount', label: 'Núm. de archivos adjuntos', group: 'media', default: true, value: ({ item }) => item.files.length },

  { key: 'createdAt', label: 'Fecha de creación', group: 'audit', default: true, value: ({ item }) => stamp(item.createdAt) },
  { key: 'createdBy', label: 'Creado por', group: 'audit', default: true, value: ({ item }) => personName(item.createdBy) },
  { key: 'updatedAt', label: 'Última actualización', group: 'audit', default: true, value: ({ item }) => stamp(item.updatedAt) },
  { key: 'id', label: 'ID interno', group: 'audit', default: false, value: ({ item }) => item.id },
];

export const CUSTOM_FIELD_PREFIX = 'cf:';

// Custom fields of the company become one column each (default on).
export function customFieldColumns(fields) {
  return fields.map((field) => ({
    key: `${CUSTOM_FIELD_PREFIX}${field.id}`,
    label: field.label,
    group: 'custom',
    default: true,
    value: ({ item }) => item.customValues.find((v) => v.fieldId === field.id)?.value,
  }));
}

export const catalogGroups = (hasCustom) => (hasCustom ? [...EXPORT_GROUPS.slice(0, 5), { key: 'custom', label: 'Campos personalizados' }, ...EXPORT_GROUPS.slice(5)] : EXPORT_GROUPS);
