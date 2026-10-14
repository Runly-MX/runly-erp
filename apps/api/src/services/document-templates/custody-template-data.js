// Custody (resguardo) template contract: the data object a template is filled
// with, the tags it may use, and the built-in template used when the company
// has not uploaded one (spec 2026-10-13-inventory-custody-design §4).
import { buildMinimalDocx, paragraph, table } from './minimal-docx.js';
import { inspectDocx, renderDocx } from './docx-template.js';
import { inspectXlsx, renderXlsx } from './xlsx-template.js';
import { TemplateError } from './template-tags.js';

export const CUSTODY_SCALAR_TAGS = [
  'folio', 'date', 'kind', 'receiverName', 'receiverEmployeeNumber', 'receiverDepartment',
  'receiverJobTitle', 'receiverEmail', 'delivererName', 'comments',
  'company.name', 'company.legalName', 'company.taxId',
];
export const CUSTODY_ITEM_TAGS = ['typeBrand', 'model', 'serialNumber', 'assetNumber', 'invoiceNumber', 'features', 'index'];
export const CUSTODY_IMAGE_TAGS = ['receiverSignature', 'delivererSignature'];
export const CUSTODY_LOOPS = ['items'];
export const DEFAULT_MIN_ROWS = 2;

const KIND_LABELS = { DELIVERY: 'Entrega', RETURN: 'Devolución' };

// dd/mm/yyyy from a Date (DATE columns come back as UTC midnight) or ISO string.
export function formatDateDmy(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

const text = (value) => (value === null || value === undefined ? '' : String(value));
const fullName = (person) => [person?.firstName, person?.lastName].map(text).filter(Boolean).join(' ').trim();

// `custody` carries employee (with departmentRef/jobTitleRef), deliverer and
// items (snapshot rows); `company` is { name, legalName, rfc }.
export function buildCustodyTemplateData({ custody, company, hasReceiverSignature = false, hasDelivererSignature = false, minRows = DEFAULT_MIN_ROWS }) {
  const employee = custody.employee ?? {};
  const rows = (custody.items ?? []).map((item, index) => ({
    index: String(index + 1),
    typeBrand: text(item.typeBrand),
    model: text(item.model),
    serialNumber: text(item.serialNumber),
    assetNumber: text(item.assetTag),
    invoiceNumber: text(item.invoiceNumber),
    features: text(item.features),
  }));
  while (rows.length < minRows) {
    rows.push({ index: '', typeBrand: '', model: '', serialNumber: '', assetNumber: '', invoiceNumber: '', features: '' });
  }
  return {
    folio: text(custody.folio),
    date: formatDateDmy(custody.date),
    kind: KIND_LABELS[custody.kind] ?? text(custody.kind),
    receiverName: fullName(employee),
    receiverEmployeeNumber: text(employee.employeeCode),
    receiverDepartment: text(employee.departmentRef?.name ?? employee.department),
    receiverJobTitle: text(employee.jobTitleRef?.name ?? employee.jobTitle),
    receiverEmail: text(employee.workEmail ?? employee.personalEmail),
    delivererName: text(custody.delivererName || fullName(custody.deliverer) || custody.deliverer?.displayName),
    comments: text(custody.comments),
    company: { name: text(company?.name), legalName: text(company?.legalName), taxId: text(company?.rfc ?? company?.taxId) },
    items: rows,
    receiverSignature: hasReceiverSignature ? 'receiverSignature' : '',
    delivererSignature: hasDelivererSignature ? 'delivererSignature' : '',
  };
}

// Tags a custody template uses that the contract does not know.
export function unknownCustodyTags(tags) {
  const scalars = new Set(CUSTODY_SCALAR_TAGS);
  return tags.filter((tag) => {
    if (tag.startsWith('#') || tag.startsWith('^')) return !CUSTODY_LOOPS.includes(tag.slice(1));
    if (tag.startsWith('%')) return !CUSTODY_IMAGE_TAGS.includes(tag.slice(1));
    const [scope, ...rest] = tag.split('.');
    if (CUSTODY_LOOPS.includes(scope) && rest.length) {
      const inner = rest.join('.');
      return !CUSTODY_ITEM_TAGS.includes(inner) && !scalars.has(inner);
    }
    return !scalars.has(tag);
  });
}

export function templateFormatOf(fileName) {
  const ext = String(fileName ?? '').toLowerCase().split('.').pop();
  if (ext === 'docx' || ext === 'xlsx') return ext;
  throw new TemplateError('La plantilla debe ser un archivo .docx o .xlsx.');
}

// Shown for templates without any {{ }} tag (accepted, but rendered without data).
export const NO_TAGS_WARNING = 'La plantilla no contiene etiquetas {{…}}; el documento se generará sin datos.';

// Validates an uploaded template; throws TemplateError when malformed.
export async function inspectCustodyTemplate(buffer, format) {
  const { tags } = format === 'xlsx' ? await inspectXlsx(buffer) : inspectDocx(buffer);
  const unknown = unknownCustodyTags(tags);
  const warnings = unknown.map((tag) => `Etiqueta desconocida: {{${tag.replace(/^items\./, '')}}}`);
  if (!tags.length) warnings.push(NO_TAGS_WARNING);
  return { tags, warnings };
}

export async function renderCustodyTemplate({ format, buffer, data, images }) {
  return format === 'xlsx' ? renderXlsx(buffer, data, { images }) : renderDocx(buffer, data, { images });
}

// Built-in template when the company has none.
export function buildDefaultCustodyTemplate() {
  const body = [
    paragraph('{{company.name}}', { bold: true, size: 28, align: 'center' }),
    paragraph('Resguardo de equipo — {{kind}}', { bold: true, size: 24, align: 'center' }),
    paragraph('Folio: {{folio}}    Fecha: {{date}}'),
    paragraph('Colaborador: {{receiverName}}    No. de empleado: {{receiverEmployeeNumber}}'),
    paragraph('Departamento: {{receiverDepartment}}    Puesto: {{receiverJobTitle}}'),
    table([
      ['#', 'Tipo / marca', 'Modelo', 'Serie', 'Activo', 'Factura', 'Características'],
      ['{{#items}}{{index}}', '{{typeBrand}}', '{{model}}', '{{serialNumber}}', '{{assetNumber}}', '{{invoiceNumber}}', '{{features}}{{/items}}'],
    ]),
    paragraph('Observaciones: {{comments}}'),
    paragraph('El colaborador declara recibir el equipo descrito en buen estado y se compromete a su cuidado y devolución.'),
    paragraph('Recibe', { bold: true }),
    paragraph('{{%receiverSignature}}'),
    paragraph('{{receiverName}}'),
    paragraph('Entrega', { bold: true }),
    paragraph('{{%delivererSignature}}'),
    paragraph('{{delivererName}}'),
  ].join('');
  return buildMinimalDocx(body);
}
