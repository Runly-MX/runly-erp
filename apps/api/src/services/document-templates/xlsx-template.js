// .xlsx template engine on exceljs.
//
// Scalar `{{tag}}` placeholders are replaced in place in every cell. A row
// containing `{{#loop}}` is the row template of that loop: it is repeated once
// per element (styles copied) and its tags resolve against the element first.
// `{{%image}}` places the PNG from `options.images[key]` anchored at the cell.
import ExcelJS from 'exceljs';
import { TAG_PATTERN, TemplateError, collectTags, resolvePath, toText } from './template-tags.js';

const DEFAULT_IMAGE_SIZE = [220, 88];
const LOOP_OPEN = /\{\{\s*#\s*([^{}]+?)\s*\}\}/;
const LOOP_MARKER = /\{\{\s*[#/]\s*[^{}]*?\s*\}\}/g;

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new TemplateError('El archivo no es un libro de Excel (.xlsx) válido.');
  }
  return workbook;
}

function cellText(cell) {
  const value = cell.value;
  if (typeof value === 'string') return value;
  if (value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  return null;
}

function eachTextCell(worksheet, fn) {
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell);
      if (text !== null && text.includes('{{')) fn(cell, text, rowNumber, colNumber);
    });
  });
}

export async function inspectXlsx(buffer) {
  const workbook = await loadWorkbook(buffer);
  const texts = [];
  workbook.eachSheet((worksheet) => eachTextCell(worksheet, (_cell, text) => texts.push(text)));
  return { tags: collectTags(texts) };
}

// Replaces the tags of one cell. `scopes` is searched innermost first.
function fillCell(cell, text, scopes, { onImage }) {
  let imageKey = null;
  const next = text.replace(LOOP_MARKER, '').replace(TAG_PATTERN, (_match, prefix, rawName) => {
    const name = rawName.trim();
    let value;
    for (const scope of scopes) {
      value = resolvePath(scope, name);
      if (value !== undefined) break;
    }
    if (prefix === '%') {
      if (value) imageKey = value;
      return '';
    }
    return toText(value);
  });
  cell.value = next;
  if (imageKey) onImage(imageKey);
}

function findLoopRows(worksheet) {
  const loops = [];
  eachTextCell(worksheet, (_cell, text, rowNumber) => {
    const match = text.match(LOOP_OPEN);
    if (match && !loops.some((loop) => loop.rowNumber === rowNumber)) loops.push({ rowNumber, name: match[1] });
  });
  return loops.sort((a, b) => b.rowNumber - a.rowNumber);
}

export async function renderXlsx(buffer, data, { images = {}, imageSize = DEFAULT_IMAGE_SIZE } = {}) {
  const workbook = await loadWorkbook(buffer);
  const [width, height] = imageSize;
  const pendingImages = [];

  workbook.eachSheet((worksheet) => {
    const loopRowScopes = new Map();
    // Bottom-up so inserting rows never shifts a loop row still to expand.
    for (const { rowNumber, name } of findLoopRows(worksheet)) {
      const list = resolvePath(data, name);
      const elements = Array.isArray(list) ? list : [];
      if (elements.length > 1) worksheet.duplicateRow(rowNumber, elements.length - 1, true);
      for (const [rowRef, scopes] of [...loopRowScopes]) {
        if (rowRef > rowNumber) {
          loopRowScopes.delete(rowRef);
          loopRowScopes.set(rowRef + Math.max(elements.length - 1, 0), scopes);
        }
      }
      if (elements.length === 0) loopRowScopes.set(rowNumber, [{}]);
      elements.forEach((element, index) => loopRowScopes.set(rowNumber + index, [element]));
    }

    eachTextCell(worksheet, (cell, text, rowNumber, colNumber) => {
      const scopes = [...(loopRowScopes.get(rowNumber) ?? []), data];
      fillCell(cell, text, scopes, {
        onImage: (key) => {
          if (images[key]) pendingImages.push({ worksheet, key, col: colNumber - 1, row: rowNumber - 1 });
        },
      });
    });
  });

  for (const { worksheet, key, col, row } of pendingImages) {
    const imageId = workbook.addImage({ buffer: images[key], extension: 'png' });
    worksheet.addImage(imageId, { tl: { col, row }, ext: { width, height }, editAs: 'oneCell' });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
