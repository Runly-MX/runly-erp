// Renders a custody record (resguardo) with the company template, converts it
// to PDF when Office is configured, stores it and links it to every item, and
// e-mails it to the employee (best effort).
import { TemplateError } from './document-templates/template-tags.js';
import { buildCustodyTemplateData, renderCustodyTemplate } from './document-templates/custody-template-data.js';
import { convertToPdf } from './document-templates/pdf-convert.js';
import { InventoryServiceError } from './inventory-guards.js';
import { escapeXml } from './document-templates/minimal-docx.js';

const MAX_FILES_PER_ITEM = 20;
const MIME_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

export function createCustodyDocumentRenderer({ prisma, files, templates, convert = convertToPdf, smtpFactory = null }) {
  async function signatureImages(custody, companyId) {
    const images = {};
    for (const [key, fileId] of [['receiverSignature', custody.receiverSignatureFileId], ['delivererSignature', custody.delivererSignatureFileId]]) {
      const asset = await files.findAsset(companyId, fileId);
      if (asset) images[key] = await files.read(asset).catch(() => null);
      if (!images[key]) delete images[key];
    }
    return images;
  }

  // Returns { buffer, fileName, mimeType, format }; `custody` is the full record.
  async function render(custody, { pdf = true } = {}) {
    const companyId = custody.companyId;
    const [company, resolved, images] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true, legalName: true, rfc: true } }),
      templates.resolveForCustody(companyId, custody.templateId),
      signatureImages(custody, companyId),
    ]);
    const data = buildCustodyTemplateData({
      custody,
      company,
      hasReceiverSignature: Boolean(images.receiverSignature),
      hasDelivererSignature: Boolean(images.delivererSignature),
    });
    let rendered;
    try {
      rendered = await renderCustodyTemplate({ format: resolved.format, buffer: resolved.buffer, data, images });
    } catch (err) {
      if (err instanceof TemplateError) throw new InventoryServiceError(`No se pudo generar el documento: ${err.message}`, 422);
      throw err;
    }
    const baseName = `Resguardo ${custody.folio}`;
    const converted = pdf ? await convert(rendered, `${baseName}.${resolved.format}`) : null;
    if (converted) return { buffer: converted, fileName: `${baseName}.pdf`, mimeType: MIME_TYPES.pdf, format: 'pdf' };
    return { buffer: rendered, fileName: `${baseName}.${resolved.format}`, mimeType: MIME_TYPES[resolved.format], format: resolved.format };
  }

  // Stores the final document and links it to the record and its items.
  async function generateAndAttach(custody, { profileId = null } = {}) {
    const document = await render(custody);
    const asset = await files.store({
      companyId: custody.companyId,
      uploadedById: profileId,
      buffer: document.buffer,
      fileName: document.fileName,
      mimeType: document.mimeType,
      entityType: 'InvCustody',
      sourceEntityId: custody.id,
      metadata: { label: 'document' },
    });
    await prisma.invCustody.update({ where: { id: custody.id }, data: { documentFileId: asset.id } });
    const label = `Resguardo ${custody.folio}`.slice(0, 100);
    for (const { itemId } of custody.items) {
      const count = await prisma.invItemFile.count({ where: { itemId } });
      if (count >= MAX_FILES_PER_ITEM) continue;
      await prisma.invItemFile.create({ data: { itemId, fileAssetId: asset.id, label, sortOrder: count } }).catch(() => null);
    }
    return { asset, document };
  }

  // Never throws: the custody is already completed.
  async function emailToEmployee(custody, document) {
    const to = custody.employee?.workEmail || custody.employee?.personalEmail;
    if (!to || !smtpFactory) return false;
    try {
      const smtp = smtpFactory(custody.companyId);
      if (!(await smtp.isConfigured(custody.companyId))) return false;
      const name = [custody.employee.firstName, custody.employee.lastName].filter(Boolean).join(' ');
      const action = custody.kind === 'RETURN' ? 'la devolución' : 'la entrega';
      await smtp.sendEmail({
        to,
        companyId: custody.companyId,
        subject: `Resguardo ${custody.folio}`,
        html: `<p>Hola ${escapeXml(name)},</p><p>Te enviamos el resguardo <strong>${escapeXml(custody.folio)}</strong> correspondiente a ${action} de equipo. El documento va adjunto.</p>`,
        text: `Hola ${name},\n\nTe enviamos el resguardo ${custody.folio} correspondiente a ${action} de equipo. El documento va adjunto.`,
        attachments: [{ filename: document.fileName, content: document.buffer, contentType: document.mimeType }],
      });
      return true;
    } catch {
      return false;
    }
  }

  return { render, generateAndAttach, emailToEmployee };
}
