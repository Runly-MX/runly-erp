// `census` command: aggregate-only snapshot of a sinabe dump (+ optional uploads
// listing). Output never contains serials, asset numbers, folios, names,
// e-mails, signatures, file names or contents: only counts, sizes, schema
// metadata (table/column/migration names) and error codes.
import { stat, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadSinabe } from './source.mjs'
import { readFilesListing } from './files-listing.mjs'
import { normalizeUploadKey, classifyPathFormat, keyFolder, keyExtension, isThumbnailKey } from './paths.mjs'
import { SINABE_MIGRATIONS } from './source-schema.mjs'
import { renderCensusMarkdown } from './census-md.mjs'

const MB = 1024 * 1024
export const SIZE_BUCKETS = [
  ['<100KB', 100 * 1024], ['100KB-1MB', MB], ['1-10MB', 10 * MB], ['10-50MB', 50 * MB], ['>50MB', Infinity],
]

const inc = (obj, key, by = 1) => { obj[key] = (obj[key] ?? 0) + by }
const tally = (rows, fn) => rows.reduce((acc, row) => { inc(acc, String(fn(row) ?? '(nulo)')); return acc }, {})

export function duplicateStats(values) {
  const seen = new Map()
  let empty = 0, nulls = 0
  for (const v of values) {
    if (v == null) { nulls++; continue }
    const key = String(v).trim()
    if (!key) { empty++; continue }
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  let groups = 0, rows = 0
  for (const n of seen.values()) if (n > 1) { groups++; rows += n }
  return { nulos: nulls, vacios: empty, distintos: seen.size, valoresDuplicados: groups, filasConDuplicado: rows }
}

// Every DB column that points at an uploads file, labelled by origin.
export function collectFileRefs(src) {
  const refs = []
  const push = (origin, raw) => { if (raw != null && String(raw).trim() !== '') refs.push({ origin, raw }) }
  for (const i of src.images) { push('Image.url', i.url); push('Image.thumbnail', i.thumbnail) }
  for (const f of src.files) push('File.url', f.url)
  for (const i of src.invoices) { push('Invoice.fileUrl', i.fileUrl); push('Invoice.xmlUrl', i.xmlUrl) }
  for (const d of src.projectDocuments) push('ProjectDocument.fileUrl', d.fileUrl)
  for (const u of src.userImages) { push('UserImage.url', u.url); push('UserImage.thumbnail', u.thumbnail) }
  return refs
}

function schemaSection(src) {
  const applied = src.meta.appliedMigrations
  const known = new Set(SINABE_MIGRATIONS)
  return {
    migracionesAplicadas: applied.length,
    ultimaMigracion: applied.at(-1) ?? null,
    migracionesPendientes: SINABE_MIGRATIONS.filter((m) => !applied.includes(m)),
    migracionesDesconocidas: applied.filter((m) => !known.has(m)),
    esquemaActual: SINABE_MIGRATIONS.every((m) => applied.includes(m)),
    // Migration history was reset once (2025-06 baseline), so names alone can mislead: also judge by columns.
    esquemaCompletoPorColumnas: src.meta.missingTables.filter((t) => t !== '_prisma_migrations').length === 0 && Object.keys(src.meta.missingColumns).length === 0,
    tablasFaltantes: src.meta.missingTables,
    columnasFaltantes: src.meta.missingColumns,
    columnasExtra: src.meta.extraColumns,
    erroresJson: src.meta.jsonParseErrors,
  }
}

function dataSection(src) {
  const inv = src.inventories
  const byId = (rows) => new Set(rows.map((r) => r.id))
  const invoiceIds = byId(src.invoices), poIds = byId(src.purchaseOrders), modelIds = byId(src.models), invIds = byId(inv)
  const userIds = byId(src.users), fileIds = byId(src.files)
  const custodyFiles = src.custodyRecords.filter((c) => c.fileId)
  return {
    inventarios: {
      porEstado: tally(inv, (i) => i.status),
      deshabilitados: inv.filter((i) => i.enabled === false).length,
      altaSinFechaAlta: inv.filter((i) => i.status === 'ALTA' && !i.altaDate).length,
      bajaSinFechaBaja: inv.filter((i) => i.status === 'BAJA' && !i.bajaDate).length,
      sinFechaRecepcion: inv.filter((i) => !i.receptionDate).length,
      conDetallesJson: inv.filter((i) => i.details != null).length,
      sinUbicacion: inv.filter((i) => i.locationId == null).length,
      conFactura: inv.filter((i) => i.invoiceId).length,
      conOrdenCompra: inv.filter((i) => i.purchaseOrderId).length,
      numeroSerie: duplicateStats(inv.map((i) => i.serialNumber)),
      numeroActivo: duplicateStats(inv.map((i) => i.activeNumber)),
      folioInterno: duplicateStats(inv.map((i) => i.internalFolio)),
      conCondiciones: new Set(src.inventoryConditions.map((c) => c.inventoryId)).size,
      conMasDeUnaCondicion: Object.values(tally(src.inventoryConditions, (c) => c.inventoryId)).filter((n) => n > 1).length,
      conCamposPersonalizados: new Set(src.inventoryCustomFields.map((c) => c.inventoryId)).size,
      conImagenes: new Set(src.images.map((i) => i.inventoryId).filter(Boolean)).size,
      conArchivos: new Set(src.files.map((f) => f.inventoryId).filter(Boolean)).size,
    },
    referenciasRotas: {
      inventarioFacturaInexistente: inv.filter((i) => i.invoiceId && !invoiceIds.has(i.invoiceId)).length,
      inventarioOrdenInexistente: inv.filter((i) => i.purchaseOrderId && !poIds.has(i.purchaseOrderId)).length,
      inventarioModeloInexistente: inv.filter((i) => !modelIds.has(i.modelId)).length,
      resguardoArticuloInventarioInexistente: src.custodyItems.filter((c) => !invIds.has(c.inventoryId)).length,
      resguardoUsuarioInexistente: src.custodyRecords.filter((c) => !userIds.has(c.receiverId) || !userIds.has(c.delivererId)).length,
      resguardoArchivoInexistente: custodyFiles.filter((c) => !fileIds.has(c.fileId)).length,
    },
    usuarios: {
      total: src.users.length,
      sinNumeroEmpleado: src.users.filter((u) => !u.employeeNumber || !String(u.employeeNumber).trim()).length,
      deshabilitados: src.users.filter((u) => u.enabled === false).length,
    },
    compras: {
      ordenesCompra: src.purchaseOrders.length,
      ordenesSinProveedor: src.purchaseOrders.filter((p) => !p.supplier).length,
      facturas: src.invoices.length,
      facturasSinPdf: src.invoices.filter((i) => !i.fileUrl).length,
      facturasSinXml: src.invoices.filter((i) => !i.xmlUrl).length,
      facturasSinProveedor: src.invoices.filter((i) => !i.supplier).length,
      facturasSinOrden: src.invoices.filter((i) => !i.purchaseOrderId).length,
      folioFactura: duplicateStats(src.invoices.map((i) => i.code)),
    },
    resguardos: {
      porEstado: tally(src.custodyRecords, (c) => c.status),
      conPdf: custodyFiles.length,
      conFirmaReceptor: src.custodyRecords.filter((c) => c.receiverSignature).length,
      conFirmaEntregador: src.custodyRecords.filter((c) => c.delivererSignature).length,
      firmasDataUrl: src.custodyRecords.reduce((n, c) => n + [c.receiverSignature, c.delivererSignature].filter((s) => /^data:image\//.test(s ?? '')).length, 0),
      articulos: src.custodyItems.length,
      inventariosConResguardo: new Set(src.custodyItems.map((c) => c.inventoryId)).size,
    },
    bitacora: { porEntidad: tally(src.auditLogs, (a) => a.entityType), porAccion: tally(src.auditLogs, (a) => a.action) },
    tiposMime: { Image: tally(src.images, (i) => i.type), File: tally(src.files, (f) => f.type) },
  }
}

function filesSection(src, listing) {
  const refs = collectFileRefs(src)
  const formats = {}
  const referenced = new Map() // key -> origins
  const byOrigin = {}
  let unparseable = 0
  for (const { origin, raw } of refs) {
    inc(formats, classifyPathFormat(raw))
    const key = normalizeUploadKey(raw)
    if (!key) { unparseable++; continue }
    referenced.set(key, origin)
    byOrigin[origin] ??= { referencias: 0, faltantes: 0 }
    byOrigin[origin].referencias++
  }
  const section = { referenciasTotales: refs.length, referenciasUnicas: referenced.size, referenciasNoInterpretables: unparseable, formatosDeRuta: formats }
  if (!listing) return { ...section, listado: null }
  const disk = listing.files
  const missingByFolder = {}
  let missing = 0
  for (const [key, origin] of referenced) {
    if (disk.has(key)) continue
    missing++; inc(missingByFolder, keyFolder(key)); byOrigin[origin].faltantes++
  }
  const orphanByFolder = {}, sizeHistogram = {}, bytesByFolder = {}, extensions = {}
  let orphans = 0, orphanBytes = 0, totalBytes = 0, over10 = 0, over50 = 0, thumbs = 0
  for (const [label] of SIZE_BUCKETS) sizeHistogram[label] = { archivos: 0, bytes: 0 }
  for (const [key, entry] of disk) {
    totalBytes += entry.size
    inc(bytesByFolder, keyFolder(key), entry.size)
    inc(extensions, keyExtension(key))
    if (isThumbnailKey(key)) thumbs++
    const bucket = SIZE_BUCKETS.find(([, max]) => entry.size < max)[0]
    sizeHistogram[bucket].archivos++; sizeHistogram[bucket].bytes += entry.size
    if (entry.size > 10 * MB) over10++
    if (entry.size > 50 * MB) over50++
    if (!referenced.has(key)) { orphans++; orphanBytes += entry.size; inc(orphanByFolder, keyFolder(key)) }
  }
  return {
    ...section,
    listado: {
      archivos: disk.size, bytesTotales: totalBytes, miniaturas: thumbs, erroresListado: listing.errors,
      referenciadosFaltantes: missing, faltantesPorCarpeta: missingByFolder, faltantesPorOrigen: byOrigin,
      huerfanos: orphans, bytesHuerfanos: orphanBytes, huerfanosPorCarpeta: orphanByFolder,
      histogramaTamanos: sizeHistogram, mayoresDe10MB: over10, mayoresDe50MB: over50,
      bytesPorCarpeta: bytesByFolder, extensiones: extensions,
    },
  }
}

export function buildCensus(src, listing = null) {
  const counts = {}
  for (const [key, value] of Object.entries(src)) if (Array.isArray(value)) counts[key] = value.length
  return { conteos: counts, esquema: schemaSection(src), datos: dataSection(src), archivos: filesSection(src, listing) }
}

export async function runCensus({ dump, listing = null, out }) {
  if (!dump) throw new Error('census: --dump es obligatorio')
  if (!out) throw new Error('census: --out es obligatorio')
  const started = Date.now()
  const src = await loadSinabe(dump)
  const parsedMs = Date.now() - started
  const filesListing = listing ? await readFilesListing(listing) : null
  const census = {
    generado: new Date().toISOString(),
    entrada: { bytesDump: (await stat(dump)).size, conListado: Boolean(listing) },
    duracionMs: { lecturaDump: parsedMs, total: 0 },
    ...buildCensus(src, filesListing),
  }
  census.duracionMs.total = Date.now() - started
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'census.json'), `${JSON.stringify(census, null, 2)}\n`)
  await writeFile(join(out, 'census.md'), renderCensusMarkdown(census))
  return census
}
