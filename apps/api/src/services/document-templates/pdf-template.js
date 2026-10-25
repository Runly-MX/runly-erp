// PDF as a template source (no Office needed): the first page is the
// background and each layout field is drawn on top with pdf-lib. Also detects
// field boxes from the label text of a form PDF.
//
// Coordinates are PDF points from the TOP-LEFT corner of the first page
// (x right, y down); the renderer flips y. layout = { page: { width, height },
// fields: [{ key, x, y, w, h, fontSize, color, align, bold, background }] }.
// background (hex or null) paints a box under the text to cover sample text.
//
// Text uses the standard Helvetica fonts, whose WinAnsi encoding covers
// Spanish (á é í ó ú ü ñ ¿ ¡). Characters outside WinAnsi lose their accent
// (NFD) or become "?" so a name never breaks the PDF.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TemplateError } from './template-tags.js';
import { normalizeLabel } from './docx-autotag.js';
import { extractPdfTextItems } from './pdf-text-items.js';

export const PDF_MIME = 'application/pdf';
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

const round = (value) => Math.round(value * 100) / 100;

export async function loadPdf(buffer) {
  try {
    return await PDFDocument.load(buffer, { updateMetadata: false });
  } catch (error) {
    if (/encrypt/i.test(String(error?.message ?? error?.name))) throw new TemplateError('El PDF está protegido con contraseña; súbelo sin protección.');
    throw new TemplateError('El archivo no es un PDF válido.');
  }
}

// Validates an uploaded PDF and returns its first page size (points).
export async function inspectPdf(buffer, fileName = 'plantilla.pdf') {
  if (!/\.pdf$/i.test(String(fileName ?? ''))) throw new TemplateError('La plantilla debe ser un archivo PDF.');
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new TemplateError('Adjunta un archivo PDF.');
  if (buffer.length > PDF_MAX_BYTES) throw new TemplateError('La plantilla supera 10 MB.');
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new TemplateError('El archivo no es un PDF válido.');
  const doc = await loadPdf(buffer);
  let count, first, box;
  try {
    count = doc.getPageCount();
    first = count ? doc.getPage(0) : null;
    box = first?.getMediaBox();
  } catch {
    throw new TemplateError('El archivo no es un PDF válido.');
  }
  if (!count || !box) throw new TemplateError('El PDF no tiene páginas.');
  const warnings = [];
  if (count > 1) warnings.push(`El PDF tiene ${count} páginas; solo se usa la primera.`);
  if (first.getRotation().angle % 360) warnings.push('La primera página está girada; las posiciones de los campos pueden no coincidir. Exporta el PDF sin rotación.');
  return { page: { width: round(box.width), height: round(box.height) }, pageCount: count, warnings };
}

// Stored JSON -> { page, fields } (never throws; unknown data is dropped).
export function readLayout(value) {
  const page = value?.page && Number(value.page.width) > 0 && Number(value.page.height) > 0
    ? { width: Number(value.page.width), height: Number(value.page.height) } : null;
  return { page, fields: Array.isArray(value?.fields) ? value.fields : [] };
}

const hexColor = (value, fallback = [0.07, 0.09, 0.15]) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(value ?? ''));
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(...fallback);
};

// Replaces characters the font cannot encode (WinAnsi for standard fonts).
export function encodableText(font, text) {
  const ok = (ch) => { try { font.encodeText(ch); return true; } catch { return false; } };
  let out = '';
  for (const ch of String(text ?? '').replace(/[\r\n\t]+/g, ' ')) {
    if (ok(ch)) { out += ch; continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += base && [...base].every(ok) ? base : '?';
  }
  return out;
}

const isPng = (b) => b[0] === 0x89 && b[1] === 0x50;
const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8;

async function drawImage(doc, page, buffer, rect) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || !(isPng(buffer) || isJpeg(buffer))) return false;
  try {
    const image = isPng(buffer) ? await doc.embedPng(buffer) : await doc.embedJpg(buffer);
    const scale = Math.min(rect.w / image.width, rect.h / image.height);
    const width = image.width * scale, height = image.height * scale;
    page.drawImage(image, { x: rect.x + (rect.w - width) / 2, y: rect.y + (rect.h - height) / 2, width, height });
    return true;
  } catch {
    return false;
  }
}

function drawField(page, field, value, fonts, rect) {
  if (field.background) page.drawRectangle({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, color: hexColor(field.background) });
  const font = field.bold ? fonts.bold : fonts.regular;
  const text = encodableText(font, value).trim();
  if (!text) return;
  // Shrink to fit the box width (single line), never above the box height.
  let size = Math.min(Number(field.fontSize) || 14, rect.h / 1.05);
  while (size > 4 && font.widthOfTextAtSize(text, size) > rect.w) size = Math.max(4, size * 0.95);
  const width = font.widthOfTextAtSize(text, size);
  const x = field.align === 'center' ? rect.x + (rect.w - width) / 2 : field.align === 'right' ? rect.x + rect.w - width : rect.x;
  // Vertically centered on the cap height (~0.7 em for Helvetica).
  const y = rect.y + rect.h / 2 - size * 0.35;
  page.drawText(text, { x, y, size, font, color: hexColor(field.color) });
}

// Draws the layout fields over page 1 of `buffer`. `data` maps field key to
// text; `images` maps an image field key to a PNG/JPEG buffer; `imageKeys` is
// the set of keys drawn as pictures. `decorate({ page, fonts, box })` runs
// last (e.g. a "REVOCADO" stamp). Metadata is deterministic (issuedAt).
export async function fillPdf({ buffer, layout, data = {}, images = {}, imageKeys = new Set(), title = 'Documento', issuedAt = null, decorate = null }) {
  const source = await loadPdf(buffer);
  const doc = await PDFDocument.create({ updateMetadata: false });
  const [page] = await doc.copyPages(source, [0]);
  doc.addPage(page);
  const when = issuedAt ? new Date(issuedAt) : new Date(0);
  doc.setTitle(String(title)); doc.setProducer('Runly'); doc.setCreator('Runly'); doc.setCreationDate(when); doc.setModificationDate(when);
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const box = page.getMediaBox();
  const { page: size, fields } = readLayout(layout);
  // Layout points map 1:1 onto the media box (top-left origin in the layout).
  const sx = size ? box.width / size.width : 1, sy = size ? box.height / size.height : 1;
  for (const field of fields) {
    const rect = { x: box.x + field.x * sx, y: box.y + box.height - (field.y + field.h) * sy, w: field.w * sx, h: field.h * sy };
    if (imageKeys.has(field.key)) await drawImage(doc, page, images[field.key], rect);
    else drawField(page, field, data[field.key] ?? '', fonts, rect);
  }
  if (decorate) decorate({ page, fonts, box });
  return Buffer.from(await doc.save());
}

// ---- Field detection ---------------------------------------------------------
// items: pdfjs-like text items of page 1 as { str, x, y, w, h } (top-left
// points, h = font size). Lines are rebuilt from items on the same baseline.
export function groupLines(items) {
  const sorted = items.filter((i) => String(i?.str ?? '').length && i.h > 0)
    .map((i) => ({ ...i, base: i.y + i.h })).sort((a, b) => a.base - b.base || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const line = lines.find((l) => Math.abs(l.base - item.base) <= Math.max(2, 0.3 * Math.min(l.h, item.h)));
    if (line) { line.items.push(item); line.h = Math.max(line.h, item.h); } else lines.push({ base: item.base, h: item.h, items: [item] });
  }
  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x);
    let text = '';
    const spans = [];
    for (const item of line.items) {
      const prev = spans[spans.length - 1];
      if (prev && item.x - (prev.x + prev.w) > 0.15 * line.h && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
      spans.push({ from: text.length, to: text.length + item.str.length, x: item.x, w: item.w });
      text += item.str;
    }
    const x = line.items[0].x;
    const last = line.items[line.items.length - 1];
    return { text, spans, x, w: last.x + last.w - x, y: line.base - line.h, h: line.h, base: line.base };
  }).sort((a, b) => a.base - b.base || a.x - b.x);
}

// x of a character index inside a line (interpolated within its item).
export function xAt(line, index) {
  const span = line.spans.find((s) => index >= s.from && index < s.to) ?? (index >= line.text.length ? line.spans[line.spans.length - 1] : null);
  if (!span) return line.x;
  const len = Math.max(1, span.to - span.from);
  return span.x + span.w * (Math.min(index, span.to) - span.from) / len;
}

const TAG_IN_TEXT = /\{\{\s*%?\s*([^{}\s]+)\s*\}\}|\[\s*([^[\]{}]{2,60}?)\s*\]/g;

function textBox(key, x, y, w, h, fontSize, align = 'left', background = null) {
  return { key, x: round(x), y: round(y), w: round(w), h: round(h), fontSize: Math.round(Math.min(72, Math.max(8, fontSize)) * 2) / 2, color: '#111827', align, bold: false, background };
}

function imageBox(key, cx, cy, size) {
  const w = Math.max(size * 2, 120), h = Math.max(size * 0.8, 48);
  return { key, x: round(cx - w / 2), y: round(cy - h / 2), w: round(w), h: round(h) };
}

function clamp(field, page) {
  const w = Math.min(field.w, page.width), h = Math.min(field.h, page.height);
  return { ...field, x: round(Math.min(Math.max(0, field.x), page.width - w)), y: round(Math.min(Math.max(0, field.y), page.height - h)), w: round(w), h: round(h) };
}

// Proposes field boxes from the label text of a form. `labels` maps a
// normalized label (see normalizeLabel) to a tag key; `imageKeys` are the keys
// drawn as pictures. Recognized patterns: `{{tag}}` / `[Label]` placeholders,
// "Label ____" blanks and "Label:" followed by free space. One box per key
// (the first). Returns { page, fields, matched, missing }.
export function detectFields(items, page, { labels, imageKeys = new Set(), important = [] } = {}) {
  const map = labels instanceof Map ? labels : new Map(Object.entries(labels ?? {}));
  const keys = new Set(map.values());
  const lines = groupLines(items ?? []);
  const found = new Map();
  const add = (field, label) => { if (field && !found.has(field.key)) found.set(field.key, { field, label: String(label).trim().slice(0, 80) }); };
  for (const line of lines) {
    const { text } = line;
    let used = false;
    for (const m of text.matchAll(TAG_IN_TEXT)) {
      const raw = m[1] ?? m[2];
      const key = m[1] ? m[1].replace(/^%/, '') : map.get(normalizeLabel(raw));
      if (!key || !(keys.has(key) || imageKeys.has(key))) continue;
      used = true;
      const x0 = xAt(line, m.index), x1 = xAt(line, m.index + m[0].length);
      add(imageKeys.has(key)
        ? imageBox(key, (x0 + x1) / 2, line.y + line.h / 2, Math.max(72, line.h * 3))
        : textBox(key, x0, line.y - line.h * 0.2, Math.max(x1 - x0, Math.min(220, page.width - x0 - 36)), line.h * 1.4, line.h, 'left', '#ffffff'), m[0]);
    }
    if (used) continue;
    const blank = /_{4,}/.exec(text);
    if (blank) {
      const key = map.get(normalizeLabel(text.slice(0, blank.index).replace(/[:\s]+$/, '')));
      if (key) {
        const x0 = xAt(line, blank.index), x1 = xAt(line, blank.index + blank[0].length);
        const size = Math.min(28, Math.max(9, line.h));
        add(imageKeys.has(key)
          ? imageBox(key, (x0 + x1) / 2, line.base - 20, Math.max(72, line.h * 3))
          : textBox(key, x0, line.base - size * 1.4 - 1, Math.max(x1 - x0, 40), size * 1.4, size, 'center'), text.slice(0, blank.index));
      }
      continue;
    }
    const label = /^(.{2,40}?):\s*$/.exec(text.trim());
    const key = label ? map.get(normalizeLabel(label[1])) : null;
    if (key) {
      const x = line.x + line.w + 4;
      add(imageKeys.has(key)
        ? imageBox(key, x + 70, line.y + line.h / 2, Math.max(72, line.h * 3))
        : textBox(key, x, line.y - line.h * 0.2, Math.min(240, page.width - x - 24), line.h * 1.4, line.h), label[1]);
    }
  }
  const fields = [...found.values()].map((entry) => clamp(entry.field, page));
  return {
    page,
    fields,
    matched: [...found.values()].map((entry) => ({ key: entry.field.key, label: entry.label })),
    missing: important.filter((key) => !found.has(key)),
  };
}

// Detection straight from a PDF buffer: validates it, extracts the page-1 text
// and proposes boxes. Scanned PDFs (no text) return no fields.
export async function detectPdfFields(buffer, options = {}) {
  const { page, warnings } = await inspectPdf(buffer);
  const extracted = await extractPdfTextItems(buffer);
  const result = detectFields(extracted.items, page, options);
  return { ...result, warnings };
}
