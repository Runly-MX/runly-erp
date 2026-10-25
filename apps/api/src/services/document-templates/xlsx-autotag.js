// Suggests {{tags}} for a blank company workbook (.xlsx): a cell holding a
// known label ("Nombre", "Fecha de ingreso:") followed by an empty cell gets
// the tag written in that empty cell (or in the empty cell below when there
// is none on the right). Every tag is placed once. Heuristic only: whatever it
// cannot place is reported as missing.
import ExcelJS from 'exceljs';
import { normalizeLabel } from './docx-autotag.js';
import { TemplateError } from './template-tags.js';

function cellText(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  if (value.formula || value.sharedFormula) return String(value.result ?? '');
  if (value instanceof Date) return value.toISOString();
  return String(value.text ?? '');
}

const isBlank = (cell) => !cell || !cellText(cell).trim();
// A merged cell that belongs to another cell cannot take a value of its own.
const isMergedSlave = (cell) => Boolean(cell?.isMerged && cell.master && cell.master.address !== cell.address);

export async function suggestXlsxTagsWithLabels(buffer, { labels, important = [] } = {}) {
  const map = labels instanceof Map ? labels : new Map(Object.entries(labels ?? {}));
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { throw new TemplateError('El archivo no es un libro de Excel (.xlsx) válido.'); }
  const texts = [];
  workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => texts.push(cellText(cell)))));
  if (texts.some((text) => /\{\{[^}]+\}\}/.test(text))) {
    throw new TemplateError('Esta plantilla ya tiene etiquetas; edítala en Excel si necesitas cambiarlas.');
  }
  const applied = [];
  const placed = new Set();
  workbook.eachSheet((sheet) => {
    const labelCells = [];
    sheet.eachRow((row, r) => row.eachCell((cell, c) => {
      const text = cellText(cell).trim();
      const tag = text && text.length <= 60 ? map.get(normalizeLabel(text)) : null;
      if (tag) labelCells.push({ r, c, tag, text, span: cell.isMerged ? 1 : 0 });
    }));
    for (const { r, c, tag, text } of labelCells) {
      if (placed.has(tag)) continue;
      const right = sheet.getCell(r, c + 1);
      const below = sheet.getCell(r + 1, c);
      const target = [right, below].find((cell) => isBlank(cell) && !isMergedSlave(cell));
      if (!target) continue;
      target.value = `{{${tag}}}`;
      placed.add(tag);
      applied.push({ tag, label: text.replace(/:\s*$/, '') });
    }
  });
  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    applied,
    missing: important.filter((tag) => !placed.has(tag)),
  };
}
