// Deterministic synthetic sinabe dataset (rows + file registry). Every name,
// serial, folio and e-mail is obviously fake. Dirty data is injected on purpose
// (see DIRTY below) so census/migrate exercise their conflict paths.
import { makeSignatureDataUrl } from './synthetic-blobs.mjs'

export const DIRTY = {
  duplicateSerialRate: 0.03, nullSerialRate: 0.05, emptyActiveNumberRate: 0.06, nullActiveNumberRate: 0.02,
  duplicateActiveNumberRate: 0.02, missingFileRate: 0.015, orphanFiles: 120, bigFileBytes: 12 * 1024 * 1024,
}
export const CONDITION_NAMES = ['Nuevo', 'Semi Nuevo', 'Usado', 'En Mantenimiento', 'En Reparación', 'Descompuesto', 'Sin Probar', 'Obsoleto']

export function createRng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min, max) => min + Math.floor(next() * (max - min + 1))
  const hex = (n) => Array.from({ length: n }, () => int(0, 15).toString(16)).join('')
  return {
    next, int, hex,
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[int(0, 3)]}${hex(3)}-${hex(12)}`,
    logSize: (min, max) => Math.round(Math.exp(Math.log(min) + next() * (Math.log(max) - Math.log(min)))),
  }
}

const pad = (n, w = 4) => String(n).padStart(w, '0')
const START = Date.UTC(2019, 0, 1)
const END = Date.UTC(2026, 0, 28)

export function generateDataset({ items = 5000, seed = 1 } = {}) {
  const r = createRng(seed)
  const t = {}
  const add = (table, row) => { (t[table] ??= []).push(row); return row }
  const files = [] // { key, kind, realSize, onDisk, referenced }
  const date = (from = START, to = END) => new Date(from + Math.floor(r.next() * Math.max(1, to - from)))
  const later = (d, maxDays = 400) => new Date(Math.min(END, d.getTime() + r.int(0, maxDays) * 86_400_000 + r.int(0, 86_399_999)))
  let fileSeq = 0
  const registerFile = (folder, ext, realSize, { referenced = true, forceOnDisk = false } = {}) => {
    const name = `${1700000000000 + (++fileSeq) * 7919}-${r.int(100000000, 999999999)}.${ext}`
    const key = `${folder}/${name}`
    const onDisk = forceOnDisk || !referenced || !r.chance(DIRTY.missingFileRate)
    files.push({ key, kind: ext, realSize, onDisk, referenced })
    return key
  }
  const dbUrl = (key) => {
    const roll = r.next()
    if (roll < 0.85) return `uploads/${key}`
    if (roll < 0.90) return `/uploads/${key}`
    if (roll < 0.94) return `src\\uploads\\${key.replace(/\//g, '\\')}`
    if (roll < 0.97) return `https://sinabe.example.com/api/uploads/${key}`
    return `/api/uploads/${key}`
  }

  // --- identity -------------------------------------------------------------
  const users = Array.from({ length: Math.max(12, Math.round(items / 125)) }, (_, i) => {
    const createdAt = date(START, Date.UTC(2023, 0, 1))
    return add('User', {
      id: r.uuid(), firstName: `Usuario${pad(i + 1, 3)}`, lastName: 'Ficticio Demo', email: `usuario${pad(i + 1, 3)}@ejemplo.test`,
      userName: `demo${pad(i + 1, 3)}`, phone: r.chance(0.5) ? `555000${pad(i, 4)}` : null, password: '$2b$10$NOT.A.REAL.HASH.FOR.SYNTHETIC.DATA.ONLY',
      status: true, roleId: r.int(1, 3), createdAt, updatedAt: later(createdAt), enabled: r.chance(0.95),
      employeeNumber: r.chance(0.85) ? `EMP-DEMO-${pad(i + 1)}` : null, jobTitle: r.pick(['Analista Demo', 'Técnico Demo', 'Jefe Demo', null]),
      department: r.pick(['Depto Demo A', 'Depto Demo B', 'Depto Demo C', null]),
    })
  })
  for (const [i, u] of users.entries()) {
    if (i % 3) continue
    const key = registerFile('profile', 'jpg', r.logSize(40_000, 300_000))
    add('UserImage', { id: r.uuid(), url: dbUrl(key), thumbnail: null, type: 'image/jpeg', metadata: null, enabled: true, createdAt: u.createdAt, userId: u.id })
  }
  const userId = () => r.pick(users).id

  // --- catalogs -------------------------------------------------------------
  const ids = (n) => Array.from({ length: n }, (_, i) => i + 1)
  const scale = Math.max(1, items / 5000)
  for (const id of ids(Math.round(40 * scale))) add('InventoryType', { id, enabled: r.chance(0.95), name: `Tipo Demo ${pad(id, 3)}` })
  for (const id of ids(Math.round(60 * scale))) add('InventoryBrand', { id, name: `Marca Ficticia ${pad(id, 3)}`, enabled: r.chance(0.95) })
  for (const id of ids(Math.round(400 * scale))) {
    add('Model', { id, name: `Modelo X-${pad(id)}`, typeId: r.int(1, t.InventoryType.length), brandId: r.int(1, t.InventoryBrand.length), enabled: r.chance(0.97) })
  }
  for (const id of ids(25)) add('InventoryLocation', { id, name: `Ubicación Demo ${pad(id, 2)}`, enabled: true })
  for (const [i, name] of CONDITION_NAMES.entries()) add('Condition', { id: i + 1, name, enabled: true })
  for (const id of ids(12)) add('CustomField', { id, name: `Campo Demo ${pad(id, 2)}`, enabled: r.chance(0.9), createdAt: date(START, Date.UTC(2020, 0, 1)) })
  for (const id of ids(8)) {
    const createdAt = date(START, Date.UTC(2021, 0, 1))
    add('Vertical', { id, name: `Vertical Demo ${String.fromCharCode(64 + id)}`, enabled: true, createdAt, description: r.chance(0.5) ? 'Descripción ficticia' : null, updatedAt: later(createdAt) })
  }
  let mvId = 0
  for (const model of t.Model) {
    const n = r.chance(0.7) ? r.int(1, 2) : 0
    const used = new Set()
    for (let k = 0; k < n; k++) {
      const verticalId = r.int(1, 8)
      if (used.has(verticalId)) continue
      used.add(verticalId)
      add('ModelVertical', { id: ++mvId, modelId: model.id, verticalId })
    }
  }

  // --- projects / purchases -------------------------------------------------
  const projects = ids(Math.max(3, Math.round(10 * scale))).map((n) => {
    const startDate = date(START, Date.UTC(2025, 0, 1))
    return add('Project', {
      id: r.uuid(), code: `PRY-DEMO-${pad(n, 3)}`, name: `Proyecto Ficticio ${pad(n, 3)}`, description: 'Proyecto de prueba sintético', provider: `Proveedor Ficticio ${pad(r.int(1, 30), 2)}`,
      status: r.pick(['PLANIFICACION', 'EN_EJECUCION', 'EN_REVISION', 'FINALIZADO', 'CANCELADO', 'PAUSADO']), budgetTotal: r.int(100, 5000) * 1000, budgetUsed: r.int(0, 100) * 1000,
      startDate, endDate: later(startDate, 700), createdAt: startDate, updatedAt: later(startDate), enabled: r.chance(0.95), createdById: userId(),
    })
  })
  const supplier = () => (r.chance(0.92) ? `Proveedor Ficticio ${pad(r.int(1, 30), 2)} SA de CV` : null)
  const pos = ids(Math.round(150 * scale)).map((n) => {
    const createdAt = date()
    return add('PurchaseOrder', { id: r.uuid(), code: `OC-DEMO-${pad(n, 5)}`, supplier: supplier(), description: r.chance(0.6) ? 'Orden ficticia' : null, projectId: r.chance(0.4) ? r.pick(projects).id : null, createdAt, updatedAt: later(createdAt), createdById: userId() })
  })
  const invoices = ids(Math.round(300 * scale)).map((n) => {
    const createdAt = date()
    const pdf = r.chance(0.95) ? registerFile('projects/invoices', 'pdf', r.logSize(50_000, 400_000)) : null
    const xml = r.chance(0.9) ? registerFile('projects/invoices', 'xml', r.logSize(5_000, 15_000)) : null
    if (xml) files[files.length - 1].fiscalUuid = r.uuid().toUpperCase()
    return add('Invoice', {
      id: r.uuid(), code: `FAC-DEMO-${pad(n, 5)}`, concept: 'Concepto ficticio', supplier: supplier(), fileUrl: pdf ? dbUrl(pdf) : null,
      purchaseOrderId: r.chance(0.7) ? r.pick(pos).id : null, createdAt, updatedAt: later(createdAt), createdById: userId(), xmlUrl: xml ? dbUrl(xml) : null,
    })
  })

  // --- inventories ----------------------------------------------------------
  const serials = [], activeNumbers = []
  let icfId = 0, icId = 0
  const inventories = []
  for (let n = 1; n <= items; n++) {
    const createdAt = date()
    const roll = r.next()
    const status = roll < 0.85 ? 'ALTA' : roll < 0.9 ? 'PROPUESTA' : 'BAJA'
    let serialNumber = r.chance(DIRTY.nullSerialRate) ? null : `SN-FAKE-${pad(n, 6)}`
    if (serials.length && r.chance(DIRTY.duplicateSerialRate)) serialNumber = r.pick(serials)
    if (serialNumber) serials.push(serialNumber)
    let activeNumber = `AN-DEMO-${pad(n, 6)}`
    const an = r.next()
    if (an < DIRTY.emptyActiveNumberRate) activeNumber = ''
    else if (an < DIRTY.emptyActiveNumberRate + DIRTY.nullActiveNumberRate) activeNumber = null
    else if (activeNumbers.length && an < DIRTY.emptyActiveNumberRate + DIRTY.nullActiveNumberRate + DIRTY.duplicateActiveNumberRate) activeNumber = r.pick(activeNumbers)
    if (activeNumber) activeNumbers.push(activeNumber)
    const linkInvoice = r.chance(0.4) ? r.pick(invoices) : null
    const inv = add('Inventory', {
      id: r.uuid(), status, createdById: userId(), activeNumber, serialNumber, comments: r.chance(0.3) ? 'Comentario ficticio de prueba' : null,
      modelId: r.int(1, t.Model.length), enabled: r.chance(0.98), receptionDate: r.chance(0.7) ? createdAt : null, createdAt, updatedAt: later(createdAt),
      details: r.chance(0.3) ? { color: r.pick(['Negro', 'Gris', 'Blanco']), observacion: 'Dato ficticio' } : null,
      altaDate: status !== 'PROPUESTA' && r.chance(0.9) ? createdAt : null, bajaDate: status === 'BAJA' && r.chance(0.8) ? later(createdAt, 900) : null,
      internalFolio: r.chance(0.9) ? `FOL-DEMO-${pad(n, 6)}` : null, invoiceId: linkInvoice?.id ?? null,
      purchaseOrderId: linkInvoice?.purchaseOrderId ?? (r.chance(0.1) ? r.pick(pos).id : null), locationId: r.chance(0.8) ? r.int(1, 25) : null,
    })
    inventories.push(inv)
    if (r.chance(0.7)) {
      const used = new Set(Array.from({ length: r.int(1, 2) }, () => r.int(1, CONDITION_NAMES.length)))
      for (const conditionId of used) add('InventoryCondition', { id: ++icId, inventoryId: inv.id, conditionId })
    }
    if (r.chance(0.6)) {
      const used = new Set(Array.from({ length: r.int(1, 3) }, () => r.int(1, 12)))
      for (const customFieldId of used) add('InventoryCustomField', { id: ++icfId, inventoryId: inv.id, customFieldId, value: `Valor ficticio ${r.int(1, 999)}` })
    }
    const imageCount = r.chance(0.85) ? r.int(1, 4) : 0
    for (let k = 0; k < imageCount; k++) {
      const key = registerFile('inventories/images', 'jpg', r.logSize(200_000, 4_000_000))
      const thumbKey = `inventories/images/thumbnails/${key.split('/').pop().replace(/\.jpg$/, '')}-thumbnail.jpg`
      files.push({ key: thumbKey, kind: 'jpg', realSize: r.logSize(5_000, 15_000), onDisk: r.chance(0.99), referenced: true })
      add('Image', { id: r.uuid(), url: dbUrl(key), thumbnail: dbUrl(thumbKey), type: 'image/jpeg', metadata: null, createdAt: later(createdAt, 5), enabled: r.chance(0.97), inventoryId: inv.id })
    }
    if (r.chance(0.3)) {
      for (let k = r.int(1, 2); k > 0; k--) {
        const kind = r.pick(['pdf', 'pdf', 'pdf', 'xlsx', 'docx'])
        const key = registerFile('inventories/files', kind, r.logSize(80_000, 3_000_000))
        const type = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[kind]
        add('File', { id: r.uuid(), inventoryId: inv.id, metadata: null, uploadedAt: later(createdAt, 5), createdAt: later(createdAt, 5), enabled: true, type, url: dbUrl(key) })
      }
    }
  }
  // One oversized file kept at its real size regardless of --bytes-scale.
  const bigKey = registerFile('inventories/files', 'pdf', DIRTY.bigFileBytes, { forceOnDisk: true })
  files[files.length - 1].keepRealSize = true
  add('File', { id: r.uuid(), inventoryId: inventories[0].id, metadata: null, uploadedAt: inventories[0].createdAt, createdAt: inventories[0].createdAt, enabled: true, type: 'application/pdf', url: `uploads/${bigKey}` })

  generateActivity({ r, t, add, users, userId, inventories, projects, registerFile, dbUrl, date, later, files })
  for (let k = 0; k < DIRTY.orphanFiles; k++) {
    const folder = r.pick(['inventories/images', 'inventories/files', 'projects/invoices', 'resguardos'])
    registerFile(folder, folder === 'inventories/images' ? 'jpg' : 'pdf', r.logSize(20_000, 2_000_000), { referenced: false })
  }
  return { tables: t, files }
}

function generateActivity({ r, t, add, users, userId, inventories, projects, registerFile, dbUrl, date, later, files }) {
  // Custody records: COMPLETADO carry signatures + PDF; BORRADOR are drafts.
  const custodyCount = Math.max(10, Math.round(inventories.length * 0.08))
  for (let n = 1; n <= custodyCount; n++) {
    const done = r.chance(0.8)
    const when = date(Date.UTC(2025, 11, 1))
    let fileId = null
    if (done) {
      const key = registerFile('resguardos', 'pdf', r.logSize(30_000, 150_000))
      fileId = add('File', { id: r.uuid(), inventoryId: null, metadata: null, uploadedAt: when, createdAt: when, enabled: true, type: 'application/pdf', url: r.chance(0.9) ? `/uploads/${key}` : dbUrl(key) }).id
    }
    const record = add('CustodyRecord', {
      id: r.uuid(), code: r.chance(0.95) ? `RES-DEMO-${String(n).padStart(5, '0')}` : null, date: when, receiverId: userId(), delivererId: userId(),
      comments: r.chance(0.3) ? 'Comentario ficticio' : null, fileId, status: done ? 'COMPLETADO' : 'BORRADOR',
      publicToken: done ? null : r.hex(32), tokenExpiresAt: done ? null : later(when, 7),
      receiverSignature: done ? makeSignatureDataUrl(r.int(2_000, 6_000), n) : null, delivererSignature: done ? makeSignatureDataUrl(r.int(2_000, 6_000), n + 7) : null,
      enabled: r.chance(0.97), createdAt: when, updatedAt: later(when, 3),
    })
    for (let k = r.int(1, 5); k > 0; k--) {
      const inv = r.pick(inventories)
      add('CustodyItem', {
        id: r.uuid(), custodyRecordId: record.id, inventoryId: inv.id, typeBrand: 'Tipo Demo / Marca Ficticia', model: 'Modelo X', serialNumber: inv.serialNumber,
        assetNumber: inv.activeNumber || null, invoiceNumber: r.chance(0.4) ? 'FAC-DEMO-00000' : null, features: r.chance(0.3) ? 'Características ficticias' : null,
      })
    }
  }
  // Audit logs on inventories.
  for (const inv of inventories) {
    for (let k = r.int(0, 4); k > 0; k--) {
      const action = r.pick(['CREATE', 'UPDATE', 'UPDATE', 'UPDATE', 'DELETE'])
      add('AuditLog', {
        id: r.uuid(), entityType: 'INVENTORY', entityId: inv.id, action, entityTitle: 'Inventario ficticio',
        changes: JSON.stringify({ comments: { old: null, new: 'Comentario ficticio' } }), userId: userId(), createdAt: later(inv.createdAt),
      })
    }
  }
  // Projects: deadlines, tasks, members, documents.
  for (const p of projects) {
    for (let d = 1; d <= 4; d++) {
      const deadline = add('Deadline', {
        id: r.uuid(), name: `Hito ficticio ${d}`, description: null, status: r.pick(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO']), dueDate: later(p.startDate, 600), projectId: p.id,
        createdAt: p.createdAt, updatedAt: p.updatedAt, enabled: true, createdById: userId(), order: d,
      })
      add('_DeadlineUsers', { A: deadline.id, B: userId() })
      for (let k = 1; k <= 3; k++) {
        const task = add('DeadlineTask', {
          id: r.uuid(), name: `Tarea ficticia ${k}`, date: later(p.startDate, 600), deadlineId: deadline.id, enabled: true, createdAt: p.createdAt, updatedAt: p.updatedAt,
          createdById: userId(), description: null, order: k, status: r.pick(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'CANCELADO']),
        })
        if (r.chance(0.6)) add('_TaskUsers', { A: task.id, B: userId() })
      }
    }
    for (let k = 0; k < 3; k++) add('ProjectMember', { id: r.uuid(), role: r.pick(['Líder', 'Miembro']), name: 'Integrante Ficticio', projectId: p.id, userId: userId() })
    for (let k = 0; k < 2; k++) {
      const key = registerFile('projects/documents', 'pdf', r.logSize(100_000, 5_000_000))
      add('ProjectDocument', { id: r.uuid(), name: 'Documento ficticio', fileUrl: dbUrl(key), description: null, metadata: { origen: 'sintetico' }, enabled: true, uploadDate: p.createdAt, projectId: p.id, createdAt: p.createdAt, updatedAt: p.updatedAt, createdById: userId() })
    }
  }
  // Events with attendees.
  for (let n = 1; n <= Math.max(10, Math.round(inventories.length / 80)); n++) {
    const scheduledDate = date(Date.UTC(2024, 0, 1))
    const specific = r.chance(0.4)
    const event = add('Event', {
      id: r.uuid(), title: `Evento ficticio ${n}`, description: null, scheduledDate, completedDate: r.chance(0.5) ? later(scheduledDate, 10) : null,
      status: r.pick(['SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED', 'OVERDUE']), provider: r.chance(0.5) ? 'Proveedor Ficticio 01' : null,
      type: r.pick(['MAINTENANCE', 'GENERAL']), scope: specific ? 'SPECIFIC' : 'GLOBAL', verticalId: r.chance(0.6) ? r.int(1, 8) : null,
      isRecurring: false, recurrence: null, recurrenceEndDate: null, seriesId: null, createdAt: scheduledDate, updatedAt: scheduledDate, createdById: userId(),
    })
    if (specific) for (const u of new Set([r.pick(users), r.pick(users)])) add('EventAttendee', { id: r.uuid(), eventId: event.id, userId: u.id })
  }
  return files
}
