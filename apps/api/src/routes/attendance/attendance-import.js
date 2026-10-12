// Bulk import of attendance people from CSV/XLSX with column mapping.
// Flow: parse (headers + suggested mapping) -> preview (plan, no writes) -> commit.
import { parse as parseCsv } from 'csv-parse/sync'
import ExcelJS from 'exceljs'
import { AttendanceError, hashPin } from './attendance-core.js'
import { kindFromEmployment } from './attendance-hr.js'

export const MAX_IMPORT_ROWS = 2000
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export const IMPORT_FIELDS = [
  { key: 'code', label: 'Código de empleado', group: 'Identidad', required: true, hint: 'Único por persona; es el que se escribe en el kiosko.', aliases: ['codigo', 'codigo de empleado', 'no empleado', 'numero de empleado', 'num empleado', 'clave', 'id', 'employee code', 'matricula'] },
  { key: 'firstName', label: 'Nombre', group: 'Identidad', required: true, hint: 'Nombre(s) de la persona.', aliases: ['nombre', 'nombres', 'first name'] },
  { key: 'lastName', label: 'Apellido', group: 'Identidad', hint: 'Apellido(s).', aliases: ['apellido', 'apellidos', 'last name'] },
  { key: 'kind', label: 'Tipo', group: 'Clasificación', hint: 'Interno, contratista o visitante. Vacío = interno.', aliases: ['tipo', 'tipo de personal', 'tipo de empleado', 'clasificacion'] },
  { key: 'group', label: 'Grupo o contratista', group: 'Clasificación', hint: 'Empresa contratista o área.', aliases: ['grupo', 'contratista', 'empresa', 'empresa contratista', 'area', 'departamento'] },
  { key: 'category', label: 'Categoría u oficio', group: 'Clasificación', hint: 'Tipo de elemento (soldador, electricista...).', aliases: ['categoria', 'oficio', 'puesto', 'tipo de elemento', 'especialidad'] },
  { key: 'shift', label: 'Turno', group: 'Clasificación', hint: 'Debe existir en Configuración > Turnos.', aliases: ['turno', 'horario'] },
  { key: 'pin', label: 'PIN', group: 'Acceso', hint: '4 a 8 dígitos para checar en el kiosko.', aliases: ['pin', 'nip'] },
  { key: 'hrCode', label: 'Código o correo en RH', group: 'Acceso', hint: 'Para vincular con el expediente de RH.', aliases: ['codigo rh', 'codigo en rh', 'numero rh', 'correo', 'email', 'correo laboral'] },
]

// Exact header names of the downloadable template (order matters for the sheet).
export const TEMPLATE_HEADERS = [['code', 'Código'], ['firstName', 'Nombre'], ['lastName', 'Apellido'], ['kind', 'Tipo'], ['group', 'Grupo'], ['category', 'Categoría'], ['shift', 'Turno'], ['pin', 'PIN'], ['hrCode', 'Código RH']]

const KIND_ALIASES = { interno: 'internal', empleado: 'internal', internal: 'internal', contratista: 'contractor', externo: 'contractor', contractor: 'contractor', visitante: 'visitor', visitor: 'visitor' }

export const normalize = (value) => String(value ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

export function suggestMapping(headers) {
  const normalized = headers.map((h) => ({ header: h, n: normalize(h) }))
  const used = new Set()
  const mapping = {}
  for (const pass of ['exact', 'contains']) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key]) continue
      const found = normalized.find((h) => !used.has(h.header) && field.aliases.some((a) => (pass === 'exact' ? h.n === a : a.length >= 4 && h.n.includes(a))))
      if (found) { mapping[field.key] = found.header; used.add(found.header) }
    }
  }
  return mapping
}

export const isTemplate = (headers) => {
  const set = new Set(headers.map(normalize))
  return TEMPLATE_HEADERS.every(([, label]) => set.has(normalize(label)))
}

const cellText = (cell) => {
  if (cell == null) return ''
  if (typeof cell === 'object' && !(cell instanceof Date)) return String(cell.text ?? cell.result ?? '').trim()
  return String(cell).trim()
}

export async function parseImportFile(buffer, filename) {
  if (buffer.length > MAX_IMPORT_BYTES) throw new AttendanceError('El archivo excede el tamaño máximo de 10 MB.', 400)
  const name = String(filename ?? '').toLowerCase()
  let matrix = []
  if (name.endsWith('.csv')) {
    matrix = parseCsv(buffer, { columns: false, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true })
  } else if (name.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new AttendanceError('El archivo no tiene hojas.', 400)
    sheet.eachRow({ includeEmpty: false }, (row) => { matrix.push(row.values.slice(1).map(cellText)) })
  } else throw new AttendanceError('Formato no soportado. Usa CSV o XLSX.', 400)
  if (matrix.length < 2) throw new AttendanceError('El archivo no tiene filas de datos.', 400)
  const headers = matrix[0].map((h, i) => String(h ?? '').trim() || `Columna ${i + 1}`)
  const rows = matrix.slice(1, MAX_IMPORT_ROWS + 1).map((cells) => Object.fromEntries(headers.map((h, i) => [h, String(cells[i] ?? '').trim()]))).filter((r) => Object.values(r).some(Boolean))
  return { headers, rows, truncated: matrix.length - 1 > MAX_IMPORT_ROWS }
}

export async function buildTemplate({ groups, categories, shifts }) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Personas')
  sheet.columns = TEMPLATE_HEADERS.map(([, label]) => ({ header: label, key: label, width: 20 }))
  sheet.getRow(1).font = { bold: true }
  sheet.addRow({ Código: '1001', Nombre: 'Ana', Apellido: 'Ruiz', Tipo: 'Contratista', Grupo: groups[0]?.name ?? 'Contratista Uno', Categoría: categories[0]?.name ?? 'Soldador', Turno: shifts[0]?.name ?? '', PIN: '4821', 'Código RH': '' })
  const ref = workbook.addWorksheet('Valores válidos')
  ref.columns = [{ header: 'Tipo', width: 16 }, { header: 'Grupos', width: 28 }, { header: 'Categorías', width: 28 }, { header: 'Turnos', width: 28 }]
  ref.getRow(1).font = { bold: true }
  const size = Math.max(3, groups.length, categories.length, shifts.length)
  for (let i = 0; i < size; i += 1) ref.addRow([['Interno', 'Contratista', 'Visitante'][i] ?? '', groups[i]?.name ?? '', categories[i]?.name ?? '', shifts[i]?.name ?? ''])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export function createAttendanceImport({ prisma }) {
  async function plan(companyId, { rows = [], mapping = {}, options = {} } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) throw new AttendanceError('No hay filas para importar.', 400)
    if (rows.length > MAX_IMPORT_ROWS) throw new AttendanceError(`El máximo es ${MAX_IMPORT_ROWS} filas por importación.`, 400)
    if (!mapping.code || !mapping.firstName) throw new AttendanceError('Relaciona al menos las columnas de código y nombre.', 400)
    const [groups, categories, shifts, existing, hrRows, linkedHr] = await Promise.all([
      prisma.attGroup.findMany({ where: { companyId } }), prisma.attCategory.findMany({ where: { companyId } }), prisma.attShift.findMany({ where: { companyId } }),
      prisma.attPerson.findMany({ where: { companyId }, select: { id: true, code: true, hrEmployeeId: true } }),
      options.linkHr ? prisma.hrEmployee.findMany({ where: { companyId, enabled: true }, select: { id: true, employeeCode: true, workEmail: true, firstName: true, lastName: true, employmentType: true } }) : [],
      options.linkHr ? prisma.attPerson.findMany({ where: { companyId, hrEmployeeId: { not: null } }, select: { id: true, hrEmployeeId: true } }) : [],
    ])
    const by = (list) => new Map(list.map((x) => [normalize(x.name), x]))
    const groupMap = by(groups), categoryMap = by(categories), shiftMap = by(shifts)
    const personByCode = new Map(existing.map((p) => [normalize(p.code), p]))
    const hrByKey = new Map()
    for (const e of hrRows) { if (e.employeeCode) hrByKey.set(normalize(e.employeeCode), e); if (e.workEmail) hrByKey.set(normalize(e.workEmail), e) }
    const hrTaken = new Map(linkedHr.map((p) => [p.hrEmployeeId, p.id]))
    const seen = new Set()
    const newGroups = new Set(), newCategories = new Set()
    const out = []
    rows.forEach((raw, index) => {
      const get = (key) => String(mapping[key] ? raw[mapping[key]] ?? '' : '').trim()
      const errors = []
      const code = get('code')
      const key = normalize(code)
      if (!code) errors.push('Falta el código.')
      else if (seen.has(key)) errors.push('Código repetido en el archivo.')
      seen.add(key)
      const current = personByCode.get(key) ?? null
      const kindRaw = get('kind')
      let kind = kindRaw ? KIND_ALIASES[normalize(kindRaw)] : null
      if (kindRaw && !kind) errors.push(`Tipo no válido: ${kindRaw}.`)
      const pin = get('pin')
      if (pin && !/^\d{4,8}$/.test(pin)) errors.push('El PIN debe tener de 4 a 8 dígitos.')
      let group = null, category = null, shift = null
      const groupName = get('group'), categoryName = get('category'), shiftName = get('shift')
      if (groupName) { group = groupMap.get(normalize(groupName)) ?? null; if (!group) { if (options.createMissing) newGroups.add(groupName); else errors.push(`El grupo "${groupName}" no existe.`) } }
      if (categoryName) { category = categoryMap.get(normalize(categoryName)) ?? null; if (!category) { if (options.createMissing) newCategories.add(categoryName); else errors.push(`La categoría "${categoryName}" no existe.`) } }
      if (shiftName) { shift = shiftMap.get(normalize(shiftName)) ?? null; if (!shift) errors.push(`El turno "${shiftName}" no existe (créalo en Configuración).`) }
      let hr = null
      if (options.linkHr) {
        hr = hrByKey.get(normalize(get('hrCode'))) ?? (code ? hrByKey.get(key) : null) ?? null
        const owner = hr ? hrTaken.get(hr.id) : null
        if (hr && owner && owner !== current?.id) hr = null
      }
      const firstName = get('firstName')
      if (!firstName && !hr && !current) errors.push('Falta el nombre.')
      if (!kind) kind = group && group.kind === 'contractor' ? 'contractor' : hr ? kindFromEmployment(hr.employmentType) : 'internal'
      const status = errors.length ? 'error' : current ? (options.updateExisting ? 'update' : 'skip') : 'create'
      out.push({
        row: index + 2, status, errors, current, hr,
        data: { code, firstName: firstName || hr?.firstName || null, lastName: get('lastName') || hr?.lastName || null, kind, pin: pin || null, groupName: groupName || null, categoryName: categoryName || null, shiftId: shift?.id ?? null, groupId: group?.id ?? null, categoryId: category?.id ?? null },
        view: { code, name: [firstName || hr?.firstName, get('lastName') || hr?.lastName].filter(Boolean).join(' '), kind, group: groupName || null, category: categoryName || null, shift: shiftName || null },
      })
    })
    const count = (s) => out.filter((r) => r.status === s).length
    return { rows: out, newGroups: [...newGroups], newCategories: [...newCategories], summary: { create: count('create'), update: count('update'), skip: count('skip'), error: count('error'), newGroups: [...newGroups], newCategories: [...newCategories] } }
  }

  async function preview(companyId, body) {
    const result = await plan(companyId, body)
    return { summary: result.summary, rows: result.rows.map((r) => ({ row: r.row, status: r.status, errors: r.errors, person: r.view, hrMatch: r.hr ? { id: r.hr.id, fullName: [r.hr.firstName, r.hr.lastName].filter(Boolean).join(' ') } : null })) }
  }

  async function commit(companyId, body) {
    const result = await plan(companyId, body)
    const groupIds = new Map(), categoryIds = new Map()
    for (const name of result.newGroups) groupIds.set(normalize(name), (await prisma.attGroup.upsert({ where: { companyId_name: { companyId, name } }, update: {}, create: { companyId, name, kind: 'contractor' } })).id)
    for (const name of result.newCategories) categoryIds.set(normalize(name), (await prisma.attCategory.upsert({ where: { companyId_name: { companyId, name } }, update: {}, create: { companyId, name } })).id)
    const totals = { created: 0, updated: 0, skipped: 0, errors: 0, linked: 0, failures: [] }
    for (const item of result.rows) {
      if (item.status === 'skip') { totals.skipped += 1; continue }
      if (item.status === 'error') { totals.errors += 1; continue }
      const d = item.data
      const data = {
        firstName: d.firstName, lastName: d.lastName, kind: d.kind,
        groupId: d.groupId ?? (d.groupName ? groupIds.get(normalize(d.groupName)) ?? null : undefined),
        categoryId: d.categoryId ?? (d.categoryName ? categoryIds.get(normalize(d.categoryName)) ?? null : undefined),
        ...(d.shiftId ? { shiftId: d.shiftId } : {}), ...(d.pin ? { pinHash: hashPin(d.pin) } : {}),
        ...(item.hr ? { hrEmployeeId: item.hr.id } : {}),
      }
      try {
        if (item.status === 'create') { await prisma.attPerson.create({ data: { companyId, code: d.code, ...data } }); totals.created += 1 }
        else { await prisma.attPerson.update({ where: { id: item.current.id }, data }); totals.updated += 1 }
        if (item.hr) totals.linked += 1
      } catch (error) {
        totals.errors += 1
        totals.failures.push({ row: item.row, error: error?.code === 'P2002' ? 'Código o vínculo duplicado.' : 'No se pudo guardar la fila.' })
      }
    }
    return totals
  }

  async function template(companyId) {
    const [groups, categories, shifts] = await Promise.all([
      prisma.attGroup.findMany({ where: { companyId, enabled: true }, orderBy: { name: 'asc' } }), prisma.attCategory.findMany({ where: { companyId, enabled: true }, orderBy: { name: 'asc' } }), prisma.attShift.findMany({ where: { companyId, enabled: true }, orderBy: { name: 'asc' } }),
    ])
    return buildTemplate({ groups, categories, shifts })
  }

  return { preview, commit, template }
}
