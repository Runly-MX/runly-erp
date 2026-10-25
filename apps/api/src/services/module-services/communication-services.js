// Services that produce output for people: email and CSV/Excel reports. Both
// are `system: true` so company automations can use them in the background;
// they never read anything beyond the active company.
import ExcelJS from 'exceljs'
import { toLocalIso } from '@runly/core'
import { createCompanyMailer } from '../smtp-service.js'

const MIME = { csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
const MAX_REPORT_ROWS = 1000
const MAX_RECIPIENTS = 20
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

const STATUS_LABELS = { available: 'Disponible', assigned: 'Asignado', maintenance: 'Mantenimiento', retired: 'Baja', active: 'Activo', inactive: 'Inactivo' }
const TYPE_LABELS = { customer: 'Cliente', supplier: 'Proveedor', person: 'Persona', company: 'Empresa' }

// source -> { title, columns: [{ header, value(row) }], via: handler key }
const REPORTS = {
  contacts: {
    title: 'Contactos', via: 'runly.contacts:contacts.search',
    columns: [['Nombre', (r) => r.name], ['Tipo', (r) => TYPE_LABELS[r.type] ?? r.type], ['Correo', (r) => r.email], ['Teléfono', (r) => r.phone]],
  },
  items: {
    title: 'Inventario', via: 'runly.inventory:items.search',
    columns: [['Nombre', (r) => r.name], ['Número de activo', (r) => r.assetTag], ['Estado', (r) => STATUS_LABELS[r.status] ?? r.status]],
  },
  vehicles: {
    title: 'Vehículos', via: 'runly.fleet:vehicles.search',
    columns: [['Placa', (r) => r.plate], ['Marca', (r) => r.brand], ['Modelo', (r) => r.model], ['Año', (r) => r.year], ['Estado', (r) => STATUS_LABELS[r.status] ?? r.status], ['Conductor', (r) => r.driverName]],
  },
}

// RFC 4180 with a BOM so Excel opens the accents correctly. Cells that start
// like a formula are neutralised so a malicious contact name cannot run one.
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function buildReportFile({ source, format, rows, name }) {
  const report = REPORTS[source]
  const headers = report.columns.map(([header]) => header)
  const table = rows.map((row) => report.columns.map(([, value]) => value(row) ?? ''))
  const stamp = toLocalIso(new Date())
  const base = (name || `${report.title} ${stamp}`).replace(/[\\/:*?"<>|\s]+/g, ' ').trim().slice(0, 100) || report.title
  if (format === 'csv') {
    const text = [headers, ...table].map((line) => line.map(csvCell).join(',')).join('\r\n')
    return { name: `${base}.csv`, mimeType: MIME.csv, content: Buffer.from(`﻿${text}`, 'utf8') }
  }
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(report.title.slice(0, 31))
  sheet.addRow(headers).font = { bold: true }
  for (const line of table) sheet.addRow(line.map((cell) => (typeof cell === 'string' && /^[=+\-@]/.test(cell) ? `'${cell}` : cell)))
  sheet.columns.forEach((column, index) => { column.width = Math.min(48, Math.max(12, ...[headers[index], ...table.map((line) => line[index])].map((cell) => String(cell ?? '').length + 2))) })
  return { name: `${base}.xlsx`, mimeType: MIME.xlsx, content: Buffer.from(await workbook.xlsx.writeBuffer()) }
}

export function createCommunicationHandlers({ prisma, ServiceError, filesService, mailer = null, searchHandlers }) {
  const company = mailer ?? createCompanyMailer({ prisma })
  const requireFiles = () => {
    if (!filesService) throw new ServiceError('El almacenamiento de archivos no está disponible en esta instancia.', 503, 'files_unavailable')
    return filesService
  }

  return {
    'runly.files:report.generate': async ({ companyId, moduleKey }, args) => {
      const report = REPORTS[args.source]
      const search = searchHandlers[report.via]
      const result = await search({ companyId, actorAuthId: null, actorId: null }, { search: args.search ?? undefined, limit: MAX_REPORT_ROWS })
      const rows = (result?.items ?? []).slice(0, MAX_REPORT_ROWS)
      const file = await buildReportFile({ source: args.source, format: args.format, rows, name: args.name })
      const asset = await requireFiles().uploadForCompany({
        companyId,
        file: new File([file.content], file.name, { type: file.mimeType }),
        fields: {
          moduleKey: 'runly.files',
          entityType: 'AtlasFile',
          shareWithCompany: args.shareWithCompany !== false,
          metadata: { source: { moduleKey, sourceEntityId: args.sourceEntityId ?? null }, report: { source: args.source, rows: rows.length } },
        },
      })
      return { id: asset.id, name: asset.originalName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, sourceEntityId: args.sourceEntityId ?? null }
    },

    'runly.notifications:email.send': async ({ companyId }, args) => {
      const recipients = new Set()
      if (args.to) recipients.add(args.to.toLowerCase())
      if (args.userIds?.length) {
        const members = await prisma.userProfile.findMany({
          where: { id: { in: args.userIds }, enabled: true, memberships: { some: { companyId, enabled: true } } },
          select: { email: true },
        })
        for (const member of members) if (member.email) recipients.add(member.email.toLowerCase())
      }
      if (recipients.size === 0) throw new ServiceError('El correo necesita al menos un destinatario con correo registrado.', 400, 'no_recipients')
      if (recipients.size > MAX_RECIPIENTS) throw new ServiceError(`Un correo admite hasta ${MAX_RECIPIENTS} destinatarios.`, 400, 'too_many_recipients')

      const attachments = []
      if (args.fileId) {
        const file = await requireFiles().readForCompany({ companyId, id: args.fileId })
        if (file.content.length > MAX_ATTACHMENT_BYTES) throw new ServiceError('El archivo adjunto supera 10 MB.', 400, 'attachment_too_large')
        attachments.push({ filename: file.name, content: file.content, contentType: file.mimeType })
      }
      const text = args.body
      const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#18181b;white-space:pre-wrap">${text.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch])}</div>`

      let sent = 0
      let failed = 0
      let lastError = null
      for (const to of recipients) {
        try {
          await company.sendEmail({ companyId, to, subject: args.subject, text, html, attachments })
          sent += 1
        } catch (error) {
          failed += 1
          lastError = error
        }
      }
      // Nothing left: surface why so the run log explains it.
      if (sent === 0) throw new ServiceError(`No se pudo enviar el correo: ${lastError?.message ?? 'error de correo'}`, 502, 'mail_failed')
      return { sent, failed }
    },
  }
}
