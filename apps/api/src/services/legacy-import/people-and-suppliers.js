// Match-or-create for people and suppliers referenced by legacy records.
// Existing HR and contact data is never updated: a match is reused as is.
import { LegacyImportError, clip, writeImportAudit } from './shared.js';

const lower = (value) => String(value ?? '').trim().toLowerCase();
const collapse = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
// Case-insensitive, whitespace-normalized; accents count ("exact" full name).
export const fullNameKey = (firstName, lastName) => collapse(`${firstName ?? ''} ${lastName ?? ''}`).toLowerCase();
// Case- and accent-insensitive key for company names.
export const nameKey = (value) => collapse(String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')).toLowerCase();

// Picks the employee for a legacy person. Order: employee code, then work or
// personal e-mail, then exact full name. Returns { employee, matchedBy,
// ambiguous } or null; `ambiguous` flags several candidates at that level.
export function matchEmployee(candidates, { employeeNumber, email, firstName, lastName } = {}) {
  const levels = [];
  const code = String(employeeNumber ?? '').trim();
  if (code) levels.push(['employeeCode', (row) => String(row.employeeCode ?? '').trim() === code]);
  const mail = lower(email);
  if (mail) levels.push(['email', (row) => lower(row.workEmail) === mail || lower(row.personalEmail) === mail]);
  const name = fullNameKey(firstName, lastName);
  if (name) levels.push(['fullName', (row) => fullNameKey(row.firstName, row.lastName) === name]);
  for (const [matchedBy, test] of levels) {
    const hits = candidates.filter(test);
    if (hits.length) return { employee: hits[0], matchedBy, ambiguous: hits.length > 1 };
  }
  return null;
}

// Splits "Nombre Apellido Apellido" when the source has a single name field.
export function splitFullName(fullName) {
  const parts = collapse(fullName).split(' ').filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return { firstName: parts.slice(0, parts.length - 2).join(' '), lastName: parts.slice(-2).join(' ') };
}

const EMPLOYEE_SELECT = { id: true, employeeCode: true, firstName: true, lastName: true, workEmail: true, personalEmail: true };

export function createPeopleAndSuppliers({ prisma, refs, defaultSource }) {
  const employeeCache = new Map();
  const supplierCache = new Map();

  async function employeesOf(companyId) {
    if (!employeeCache.has(companyId)) {
      employeeCache.set(companyId, await prisma.hrEmployee.findMany({ where: { companyId, enabled: true }, select: EMPLOYEE_SELECT, orderBy: { createdAt: 'asc' } }));
    }
    return employeeCache.get(companyId);
  }

  async function catalogId(model, companyId, name) {
    const text = clip(name, 200);
    if (!text) return null;
    const row = await prisma[model].findFirst({ where: { companyId, enabled: true, name: { equals: text, mode: 'insensitive' } }, select: { id: true } });
    return row?.id ?? null;
  }

  // Returns { id, created, matchedBy, ambiguous }. legacyId (optional) is
  // remembered for both matches and creations.
  async function matchOrCreateEmployee({ companyId, actorId = null, source = defaultSource, legacyId, employeeNumber, email, firstName, lastName, fullName, department, jobTitle }) {
    const names = (firstName || lastName) ? { firstName: collapse(firstName), lastName: collapse(lastName) } : splitFullName(fullName);
    const key = legacyId ? { companyId, source, entity: 'hr_employee', legacyId } : null;
    if (key) {
      const previous = await refs.find(key);
      if (previous) return { id: previous, created: false, matchedBy: 'legacyRef', ambiguous: false };
    }
    const candidates = await employeesOf(companyId);
    const match = matchEmployee(candidates, { employeeNumber, email, ...names });
    if (match) {
      if (key) await prisma.$transaction((tx) => refs.remember(tx, key, match.employee.id)).catch((err) => { if (err?.code !== 'P2002') throw err; });
      return { id: match.employee.id, created: false, matchedBy: match.matchedBy, ambiguous: match.ambiguous };
    }
    if (!names.firstName) throw new LegacyImportError('No se puede crear un colaborador sin nombre.');
    const [departmentId, jobTitleId] = await Promise.all([catalogId('hrDepartment', companyId, department), catalogId('hrJobTitle', companyId, jobTitle)]);
    const create = async (tx) => {
      const employee = await tx.hrEmployee.create({
        data: {
          companyId, firstName: names.firstName.slice(0, 200), lastName: names.lastName.slice(0, 200),
          employeeCode: clip(employeeNumber, 60), workEmail: clip(email, 255)?.toLowerCase() ?? null,
          department: clip(department, 200), jobTitle: clip(jobTitle, 200), departmentId, jobTitleId,
          metadata: { importedFrom: source, ...(legacyId ? { legacyId: String(legacyId) } : {}) },
        },
        select: EMPLOYEE_SELECT,
      });
      await writeImportAudit(tx, {
        companyId, actorId, moduleKey: 'runly.hr', entityType: 'HrEmployee', entityId: employee.id, action: 'hr.employee.imported',
        after: { firstName: employee.firstName, lastName: employee.lastName, employeeCode: employee.employeeCode }, source, legacyId,
      });
      createdRow = employee;
      return employee.id;
    };
    let createdRow = null;
    const result = key ? await refs.ensure(key, create) : { id: await prisma.$transaction(create), created: true };
    if (result.created && createdRow) candidates.push(createdRow);
    return { ...result, matchedBy: null, ambiguous: false };
  }

  async function contactsOf(companyId) {
    if (!supplierCache.has(companyId)) {
      const rows = await prisma.contact.findMany({ where: { companyId, enabled: true }, select: { id: true, name: true, legalName: true }, orderBy: { createdAt: 'asc' } });
      supplierCache.set(companyId, rows);
    }
    return supplierCache.get(companyId);
  }

  // Case/accent-insensitive match on contact name or legal name; else creates
  // a company contact with a purchases supplier profile. Returns { id, created }.
  async function matchOrCreateSupplier({ companyId, actorId = null, source = defaultSource, legacyId, name, taxId, email, phone, supplierCode }) {
    const display = clip(collapse(name), 255);
    if (!display) throw new LegacyImportError('El proveedor requiere nombre.');
    const key = legacyId ? { companyId, source, entity: 'contact_supplier', legacyId } : null;
    if (key) {
      const previous = await refs.find(key);
      if (previous) return { id: previous, created: false, matchedBy: 'legacyRef' };
    }
    const wanted = nameKey(display);
    const contacts = await contactsOf(companyId);
    const match = contacts.find((row) => nameKey(row.name) === wanted || (row.legalName && nameKey(row.legalName) === wanted));
    if (match) {
      if (key) await prisma.$transaction((tx) => refs.remember(tx, key, match.id)).catch((err) => { if (err?.code !== 'P2002') throw err; });
      return { id: match.id, created: false, matchedBy: 'name' };
    }
    const create = async (tx) => {
      const contact = await tx.contact.create({
        data: {
          companyId, type: 'company', name: display, taxId: clip(taxId, 20), email: clip(email, 255), phone: clip(phone, 40),
          metadata: { importedFrom: source, ...(legacyId ? { legacyId: String(legacyId) } : {}) },
        },
      });
      await tx.purchaseSupplierProfile.create({ data: { companyId, contactId: contact.id, supplierCode: clip(supplierCode, 60), notes: `Importado desde ${source}` } });
      await writeImportAudit(tx, {
        companyId, actorId, moduleKey: 'runly.contacts', entityType: 'Contact', entityId: contact.id, action: 'contacts.contact.imported',
        after: { name: contact.name }, source, legacyId,
      });
      return contact.id;
    };
    const result = key ? await refs.ensure(key, create) : { id: await prisma.$transaction(create), created: true };
    if (result.created) contacts.push({ id: result.id, name: display, legalName: null });
    return { ...result, matchedBy: null };
  }

  function clearCaches() {
    employeeCache.clear();
    supplierCache.clear();
  }

  return { matchOrCreateEmployee, matchOrCreateSupplier, clearCaches };
}
