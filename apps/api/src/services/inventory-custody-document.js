// Renders a custody record (resguardo) with the company template, converts it
// to PDF when Office is configured, stores it and links it to every item, and
// e-mails it to the employee (best effort).
import { buildCustodyTemplateData } from './document-templates/custody-template-data.js';
import { InventoryServiceError } from './inventory-guards.js';
import { escapeXml } from './document-templates/minimal-docx.js';

const MAX_FILES_PER_ITEM = 20;
const KIND = 'inventory.custody';
const FORMAT_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
};

// `engine` is the documents hub engine (hub.engine): it picks the template
// (chosen, company default, built-in), fills it, converts to PDF when Office is
// configured (else keeps the native file) and records a GeneratedDocument.
export function createCustodyDocumentRenderer({ prisma, files, engine, smtpFactory = null }) {
  async function signatureImages(custody, companyId) {
    const images = {};
    for (const [key, fileId] of [['receiverSignature', custody.receiverSignatureFileId], ['delivererSignature', custody.delivererSignatureFileId]]) {
      const asset = await files.findAsset(companyId, fileId);
      if (asset) images[key] = await files.read(asset).catch(() => null);
      if (!images[key]) delete images[key];
    }
    return images;
  }

  // Runs the engine; a chosen template that no longer exists falls back to the default.
  async function run(method, custody, { pdf, profileId }) {
    const companyId = custody.companyId;
    const [company, images] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true, legalName: true, rfc: true } }),
      signatureImages(custody, companyId),
    ]);
    const data = buildCustodyTemplateData({
      custody,
      company,
      hasReceiverSignature: Boolean(images.receiverSignature),
      hasDelivererSignature: Boolean(images.delivererSignature),
    });
    const base = {
      companyId, actorId: profileId, trusted: true, kind: KIND, data, images, sourceId: custody.id,
      title: `Resguardo ${custody.folio}`, output: pdf ? 'pdf' : 'native',
    };
    const chosen = custody.documentTemplateId ?? custody.templateId ?? undefined;
    try {
      try {
        return await engine[method]({ ...base, templateId: chosen });
      } catch (err) {
        if (chosen && ['template_not_found', 'template_not_published', 'file_not_found'].includes(err?.code)) {
          return await engine[method](base);
        }
        throw err;
      }
    } catch (err) {
      if (err?.name === 'DocumentTemplateServiceError') throw new InventoryServiceError(`No se pudo generar el documento: ${err.message}`, err.status === 400 ? 422 : err.status);
      throw err;
    }
  }

  // Returns { buffer, fileName, mimeType, format }; `custody` is the full record.
  async function render(custody, { pdf = true, record = false, profileId = null } = {}) {
    const result = await run(record ? 'generate' : 'preview', custody, { pdf, profileId });
    const mimeType = result.mimeType ?? FORMAT_MIME[result.format];
    return { buffer: result.buffer, fileName: `Resguardo ${custody.folio}.${result.format}`, mimeType, format: result.format };
  }

  // Stores the final document and links it to the record and its items.
  async function generateAndAttach(custody, { profileId = null } = {}) {
    const document = await render(custody, { record: true, profileId });
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

  // Signing link to the employee (spec §9.7). Never throws.
  async function emailSigningLink(custody, url, expiresAt) {
    const to = custody.employee?.workEmail || custody.employee?.personalEmail;
    if (!to || !url || !smtpFactory) return false;
    try {
      const smtp = smtpFactory(custody.companyId);
      if (!(await smtp.isConfigured(custody.companyId))) return false;
      const name = [custody.employee.firstName, custody.employee.lastName].filter(Boolean).join(' ');
      const until = new Date(expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
      await smtp.sendEmail({
        to,
        companyId: custody.companyId,
        subject: `Firma tu resguardo ${custody.folio}`,
        html: `<p>Hola ${escapeXml(name)},</p><p>Revisa y firma el resguardo <strong>${escapeXml(custody.folio)}</strong> en el siguiente enlace:</p><p><a href="${escapeXml(url)}">${escapeXml(url)}</a></p><p>El enlace vence el ${escapeXml(until)}.</p>`,
        text: `Hola ${name},\n\nRevisa y firma el resguardo ${custody.folio} en este enlace:\n${url}\n\nEl enlace vence el ${until}.`,
      });
      return true;
    } catch {
      return false;
    }
  }

  return { render, generateAndAttach, emailToEmployee, emailSigningLink };
}
