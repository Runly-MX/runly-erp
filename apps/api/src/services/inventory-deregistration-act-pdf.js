// Renders the acta de baja PDF: header, summary, one card per asset (data,
// proposal, history, evidence) and the signature block. Pure: takes the
// act snapshot and returns a Buffer, so it is testable without storage.
import {
  drawPdfFooter, drawPdfHeader, lightenHex, normalizeHexColor, resolvePdfDocumentCtor,
} from './pdf-branding-service.js';

export const REASON_LABELS = {
  obsolescence: 'Obsolescencia', damage: 'Daño', loss: 'Pérdida', theft: 'Robo',
  sale: 'Venta', donation: 'Donación', destruction: 'Destrucción', other: 'Otro',
};
export const reasonText = (value) => REASON_LABELS[value] ?? value ?? '-';

const MARGIN = 44;
const C_DARK = '#0F172A';
const C_MID = '#334155';
const C_MUTED = '#64748B';
const C_BORDER = '#E2E8F0';

const day = (value) => {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '-';
};
const stamp = (value) => (value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const money = (value) => (value === null || value === undefined || value === '' ? '-' : Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }));

// act: { folio, effectiveDate, reason, comments, approverName, approverTitle, signedAt, itemCount, items[] }
// item: { name, assetTag, serialNumber, brand, model, category, location, area, condition,
//   purchaseDate, purchasePrice, vendorName, invoiceNumber, holder, reason,
//   proposal: { by, at, comment, reason } | null, history: [{ label, by, at, comment }], evidence: [name] }
export async function renderDeregistrationActPdf({ act, branding, signaturePng = null }) {
  const PDFDocument = await resolvePdfDocumentCtor();
  if (typeof PDFDocument !== 'function') throw new Error('PDF no disponible.');
  const brandColor = normalizeHexColor(branding.primaryColor, '#0F766E');
  const light = lightenHex(brandColor, 0.92);
  const doc = new PDFDocument({ margin: 0, size: 'LETTER', layout: 'portrait', bufferPages: true });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const width = doc.page.width - MARGIN * 2;
  const header = (subtitle) => drawPdfHeader(doc, { branding, title: 'Acta de baja de activos', subtitle, folio: act.folio });
  let y = header(`${act.itemCount} activo${act.itemCount === 1 ? '' : 's'}`);

  const ensure = (needed) => {
    if (y + needed <= doc.page.height - 56) return;
    doc.addPage();
    y = header('Continuación');
  };
  const heading = (text) => {
    ensure(34);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(brandColor).text(text.toUpperCase(), MARGIN, y, { width, lineBreak: false });
    doc.lineWidth(0.5).moveTo(MARGIN, y + 13).lineTo(MARGIN + width, y + 13).stroke(C_BORDER);
    y += 20;
  };
  const paragraph = (text, { size = 9, color = C_MID, indent = 0 } = {}) => {
    doc.font('Helvetica').fontSize(size);
    const h = doc.heightOfString(text, { width: width - indent });
    ensure(h + 6);
    doc.fillColor(color).text(text, MARGIN + indent, y, { width: width - indent });
    y += h + 6;
  };
  // Label/value pairs in two columns.
  const facts = (pairs) => {
    const colW = width / 2;
    const rows = pairs.filter(([, v]) => v && v !== '-');
    for (let i = 0; i < rows.length; i += 2) {
      const pair = rows.slice(i, i + 2);
      doc.font('Helvetica').fontSize(8.5);
      const h = Math.max(...pair.map(([, v]) => doc.heightOfString(String(v), { width: colW - 12 }))) + 11;
      ensure(h + 4);
      pair.forEach(([label, value], col) => {
        const x = MARGIN + col * colW;
        doc.font('Helvetica').fontSize(7).fillColor(C_MUTED).text(label, x, y, { width: colW - 12, lineBreak: false });
        doc.font('Helvetica').fontSize(8.5).fillColor(C_DARK).text(String(value), x, y + 9, { width: colW - 12 });
      });
      y += h + 3;
    }
  };

  heading('Datos de la baja');
  facts([
    ['Folio del acta', act.folio],
    ['Fecha efectiva de la baja', day(act.effectiveDate)],
    ['Motivo', act.reason ? reasonText(act.reason) : 'Varios (ver detalle por activo)'],
    ['Autorizó', [act.approverName, act.approverTitle].filter(Boolean).join(' · ')],
    ['Total de activos', String(act.itemCount)],
    ['Fecha de autorización', stamp(act.signedAt ?? act.createdAt)],
  ]);
  if (act.comments) {
    y += 4;
    doc.font('Helvetica').fontSize(7).fillColor(C_MUTED).text('Comentarios de la autorización', MARGIN, y, { lineBreak: false });
    y += 10;
    paragraph(act.comments, { color: C_DARK });
  }

  heading('Activos dados de baja');
  act.items.forEach((item, index) => {
    ensure(120);
    doc.rect(MARGIN, y, width, 20).fill(light);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C_DARK)
      .text(`${index + 1}. ${item.name ?? 'Activo'}`, MARGIN + 8, y + 6, { width: width - 16, lineBreak: false, ellipsis: true });
    y += 28;
    facts([
      ['Número de activo', item.assetTag], ['Número de serie', item.serialNumber],
      ['Marca', item.brand], ['Modelo', item.model],
      ['Categoría', item.category], ['Ubicación', item.location],
      ['Área', item.area], ['Condición física', item.condition],
      ['Último responsable', item.holder], ['Motivo de baja', item.reason ? reasonText(item.reason) : null],
      ['Fecha de compra', item.purchaseDate ? day(item.purchaseDate) : null], ['Costo de adquisición', item.purchasePrice ? money(item.purchasePrice) : null],
      ['Proveedor', item.vendorName], ['Factura', item.invoiceNumber],
    ]);
    if (item.proposal) {
      paragraph(`Propuesta de baja: ${item.proposal.by ?? 'Sin dato'} · ${stamp(item.proposal.at)}${item.proposal.comment ? `\n${item.proposal.comment}` : ''}`, { size: 8.5, color: C_DARK, indent: 4 });
    }
    if (item.history?.length) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C_MUTED);
      ensure(14);
      doc.text('Historial administrativo', MARGIN + 4, y, { lineBreak: false });
      y += 11;
      for (const event of item.history) {
        paragraph(`${event.label} · ${event.by ?? 'Sistema'} · ${stamp(event.at)}${event.comment ? ` — ${event.comment}` : ''}`, { size: 8, indent: 10 });
      }
    }
    if (item.evidence?.length) paragraph(`Evidencia adjunta: ${item.evidence.join(', ')}`, { size: 8, color: C_MUTED, indent: 4 });
    y += 6;
  });

  heading('Declaración');
  paragraph(`Se hace constar que el ${day(act.effectiveDate)} se autoriza la baja administrativa de ${act.itemCount === 1 ? 'el activo descrito' : `los ${act.itemCount} activos descritos`} en este documento, quedando fuera del inventario operativo de ${branding.companyName}. El registro permanece en el historial para consulta y auditoría.`);

  // Signature block stays together on one page.
  ensure(150);
  y += 16;
  const slots = [
    { role: 'Autoriza', name: act.approverName, title: act.approverTitle, image: signaturePng },
    { role: 'Responsable del activo', name: '', title: '', image: null },
    { role: 'Contraloría / Testigo', name: '', title: '', image: null },
  ];
  const slotW = width / slots.length;
  slots.forEach((slot, i) => {
    const x = MARGIN + i * slotW;
    if (slot.image) {
      try { doc.image(slot.image, x + 12, y, { fit: [slotW - 36, 56], align: 'center', valign: 'bottom' }); } catch { /* signature unreadable: the line stays */ }
    }
    doc.lineWidth(0.6).moveTo(x + 10, y + 62).lineTo(x + slotW - 14, y + 62).stroke(C_MID);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C_DARK).text(slot.role, x + 10, y + 67, { width: slotW - 24, align: 'center', lineBreak: false });
    if (slot.name) doc.font('Helvetica').fontSize(8).fillColor(C_MID).text(slot.name, x + 10, y + 79, { width: slotW - 24, align: 'center', lineBreak: false, ellipsis: true });
    if (slot.title) doc.font('Helvetica').fontSize(7.5).fillColor(C_MUTED).text(slot.title, x + 10, y + 90, { width: slotW - 24, align: 'center', lineBreak: false, ellipsis: true });
  });

  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    drawPdfFooter(doc, { branding, pageNumber: p - range.start + 1, totalPages: range.count });
  }
  doc.end();
  return done;
}
