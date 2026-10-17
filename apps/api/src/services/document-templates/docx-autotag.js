// Suggests custody tags for a blank company form (.docx): finds label cells
// ("Fecha", "Nombre", "Área de adscripción"...), the equipment table header
// (Tipo / Marca, Modelo, Serie...) and the signature labels ("Recibí equipo",
// "Entrega"), and writes {{tags}} into the matching empty cells. The result is
// the same document, ready to review in Word and re-upload. Heuristic only:
// anything it cannot place is reported as missing.
import PizZip from 'pizzip';
import { TemplateError } from './template-tags.js';

// Normalized label -> scalar tag (exact match after normalization).
const LABELS = new Map(Object.entries({
  fecha: 'date', 'fecha de entrega': 'date', 'fecha de elaboracion': 'date', 'fecha del resguardo': 'date',
  folio: 'folio', 'no de resguardo': 'folio', 'numero de resguardo': 'folio', 'folio del resguardo': 'folio',
  nombre: 'receiverName', 'nombre del empleado': 'receiverName', 'nombre del colaborador': 'receiverName',
  'nombre del usuario': 'receiverName', 'nombre completo': 'receiverName', empleado: 'receiverName',
  colaborador: 'receiverName', usuario: 'receiverName', resguardante: 'receiverName', 'nombre del resguardante': 'receiverName',
  numero: 'receiverEmployeeNumber', 'numero de empleado': 'receiverEmployeeNumber', 'no de empleado': 'receiverEmployeeNumber',
  'num de empleado': 'receiverEmployeeNumber', 'no empleado': 'receiverEmployeeNumber', 'num empleado': 'receiverEmployeeNumber',
  'numero de nomina': 'receiverEmployeeNumber', nomina: 'receiverEmployeeNumber', ficha: 'receiverEmployeeNumber',
  area: 'receiverDepartment', 'area de adscripcion': 'receiverDepartment', adscripcion: 'receiverDepartment',
  departamento: 'receiverDepartment', depto: 'receiverDepartment', 'area o departamento': 'receiverDepartment',
  puesto: 'receiverJobTitle', cargo: 'receiverJobTitle', 'puesto del empleado': 'receiverJobTitle',
  correo: 'receiverEmail', 'correo electronico': 'receiverEmail', email: 'receiverEmail', 'e mail': 'receiverEmail',
  comentarios: 'comments', observaciones: 'comments', notas: 'comments', 'comentarios adicionales': 'comments',
}));

// Equipment table header -> item tag.
const ITEM_COLUMNS = new Map(Object.entries({
  'tipo marca': 'typeBrand', tipo: 'typeBrand', 'tipo de equipo': 'typeBrand', equipo: 'typeBrand', 'marca tipo': 'typeBrand',
  marca: 'typeBrand', descripcion: 'features', modelo: 'model',
  serie: 'serialNumber', 'no de serie': 'serialNumber', 'numero de serie': 'serialNumber', 'num serie': 'serialNumber', 'n s': 'serialNumber',
  'num activo': 'assetNumber', 'no activo': 'assetNumber', 'numero de activo': 'assetNumber', activo: 'assetNumber',
  'no de activo': 'assetNumber', inventario: 'assetNumber', 'no de inventario': 'assetNumber', etiqueta: 'assetNumber',
  factura: 'invoiceNumber', 'no de factura': 'invoiceNumber', 'num factura': 'invoiceNumber',
  caracteristicas: 'features', especificaciones: 'features', observaciones: 'features',
  no: 'index', '#': 'index', partida: 'index', 'n': 'index',
}));

const RECEIVER_SIGNATURE = /^(recibi|recibe|recibido|resguardante|firma de quien recibe|firma del usuario|firma del empleado|firma del colaborador)\b/;
const DELIVERER_SIGNATURE = /^(entrega|entregue|entregado|firma de quien entrega)\b/;

// Custody vocabulary (the default of suggestDocxTags).
const CUSTODY_CONFIG = {
  labels: LABELS,
  itemColumns: ITEM_COLUMNS,
  signatures: [
    { pattern: RECEIVER_SIGNATURE, tag: 'receiverSignature' },
    { pattern: DELIVERER_SIGNATURE, tag: 'delivererSignature' },
  ],
};

export const normalizeLabel = (text) => String(text ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/&amp;/g, '&').replace(/[.:_/\\()-]+/g, ' ').replace(/\s+/g, ' ').trim();

// Top-level <w:tag> ranges inside [from, to), balancing nested same-name tags.
function elements(xml, tag, from = 0, to = xml.length) {
  const re = new RegExp(`<w:${tag}(?=[\\s>/])|</w:${tag}>`, 'g');
  re.lastIndex = from;
  const out = [];
  let depth = 0;
  let start = -1;
  for (let m = re.exec(xml); m && m.index < to; m = re.exec(xml)) {
    if (m[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) out.push({ start, end: m.index + m[0].length });
    } else {
      const close = xml.indexOf('>', m.index);
      if (xml[close - 1] === '/') { if (depth === 0) out.push({ start: m.index, end: close + 1 }); continue; }
      if (depth === 0) start = m.index;
      depth += 1;
    }
  }
  return out;
}

const textOf = (xml) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text, rPr = '') => `<w:r>${rPr}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;

function paragraphMarkRpr(par) {
  const pPr = par.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  return pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
}

// Appends text to the first paragraph of a cell (keeps the paragraph style).
function writeInCell(cell, text) {
  const par = elements(cell, 'p')[0];
  if (!par) return cell.replace('</w:tc>', `<w:p>${run(text)}</w:p></w:tc>`);
  const p = cell.slice(par.start, par.end);
  const next = p.endsWith('/>') ? `<w:p>${run(text)}</w:p>` : `${p.slice(0, -'</w:p>'.length)}${run(text, paragraphMarkRpr(p))}</w:p>`;
  return cell.slice(0, par.start) + next + cell.slice(par.end);
}

// Adds a paragraph before the first paragraph that has text.
function addParagraphBeforeLabel(cell, text) {
  const pars = elements(cell, 'p');
  const par = pars.find((r) => textOf(cell.slice(r.start, r.end)).trim()) ?? pars[0];
  if (!par) return cell;
  const p = cell.slice(par.start, par.end);
  const pPr = p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const runs = [...p.matchAll(/<w:r(?:\s[^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/g)];
  const rPr = (runs.at(-1)?.[1] ?? paragraphMarkRpr(p)).replace(/<w:i\/>|<w:iCs\/>/g, '');
  const added = `<w:p>${pPr}${run(text, rPr)}</w:p>`;
  return cell.slice(0, par.start) + added + cell.slice(par.start);
}

function parseRow(xml, range) {
  const row = xml.slice(range.start, range.end);
  let grid = 0;
  const cells = elements(row, 'tc').map((c) => {
    const cellXml = row.slice(c.start, c.end);
    const span = Number(cellXml.match(/<w:gridSpan w:val="(\d+)"/)?.[1] ?? 1);
    const cell = { ...c, xml: cellXml, text: normalizeLabel(textOf(cellXml)), gridStart: grid, span };
    grid += span;
    return cell;
  });
  return { ...range, xml: row, cells };
}

const isEmptyRow = (row) => row.cells.every((c) => !c.text);

// Plans the edits of one table: { cellEdits: Map(rowIdx -> Map(cellIdx -> fn)), dropRows: Set }.
function planTable(rows, applied, cfg) {
  const edits = new Map();
  const dropRows = new Set();
  const edit = (r, c, fn) => {
    if (!edits.has(r)) edits.set(r, new Map());
    const prev = edits.get(r).get(c);
    edits.get(r).set(c, prev ? (x) => fn(prev(x)) : fn);
  };
  const cellAtGrid = (row, gridStart) => row?.cells.findIndex((c) => c.gridStart === gridStart) ?? -1;

  rows.forEach((row, r) => {
    // Equipment table: a header row with at least three known columns.
    const columns = row.cells.map((c) => cfg.itemColumns?.get(c.text) ?? null);
    if (cfg.itemColumns && columns.filter(Boolean).length >= 3 && !applied.some((a) => a.tag === '#items')) {
      const target = rows[r + 1];
      if (!target || !isEmptyRow(target)) return;
      const mapped = row.cells
        .map((c, i) => ({ tag: columns[i], at: cellAtGrid(target, c.gridStart), label: textOf(row.cells[i].xml).trim() }))
        .filter((m) => m.tag && m.at >= 0);
      if (mapped.length < 3) return;
      mapped.forEach((m, i) => {
        const open = i === 0 ? '{{#items}}' : '';
        const close = i === mapped.length - 1 ? '{{/items}}' : '';
        edit(r + 1, m.at, (x) => writeInCell(x, `${open}{{${m.tag}}}${close}`));
        applied.push({ tag: m.tag, label: m.label });
      });
      applied.push({ tag: '#items', label: 'Fila de equipos (se repite por artículo)' });
      for (let k = r + 2; k < rows.length && isEmptyRow(rows[k]) && rows[k].cells.length === target.cells.length; k += 1) dropRows.add(k);
      row.consumed = true;
      return;
    }
    if (row.consumed) return;

    row.cells.forEach((cell, i) => {
      if (!cell.text) return;
      const tag = cfg.labels.get(cell.text);
      if (tag) {
        const next = row.cells[i + 1];
        if (next && !next.text) {
          edit(r, i + 1, (x) => writeInCell(x, `{{${tag}}}`));
          applied.push({ tag, label: textOf(cell.xml).trim() });
          return;
        }
        // Section header ("Comentarios") alone in its row: write into the widest empty cell below.
        const others = row.cells.filter((c, k) => k !== i && c.text);
        const below = rows[r + 1];
        if (!others.length && below && !below.consumed && isEmptyRow(below)) {
          const widest = below.cells.reduce((best, c, k) => (c.span > (below.cells[best]?.span ?? 0) ? k : best), 0);
          edit(r + 1, widest, (x) => writeInCell(x, `{{${tag}}}`));
          applied.push({ tag, label: textOf(cell.xml).trim() });
        }
        return;
      }
      const role = (cfg.signatures ?? []).find((s) => s.pattern.test(cell.text));
      if (!role || cell.text.split(' ').length > 5) return;
      // Only the signature image is added: the form's layout stays as designed
      // (names under the line can be added by hand with {{receiverName}}/{{delivererName}}).
      const signature = `{{%${role.tag}}}`;
      const above = rows[r - 1];
      const at = cellAtGrid(above, cell.gridStart);
      if (above && at >= 0 && !above.cells[at].text) edit(r - 1, at, (x) => writeInCell(x, signature));
      else edit(r, i, (x) => addParagraphBeforeLabel(x, signature));
      applied.push({ tag: role.tag, label: textOf(cell.xml).trim() });
    });
  });
  return { edits, dropRows };
}

function rewriteTable(xml, tbl, applied, cfg) {
  const rowRanges = elements(xml, 'tr', tbl.start, tbl.end);
  const rows = rowRanges.map((range) => parseRow(xml, range));
  const { edits, dropRows } = planTable(rows, applied, cfg);
  let out = '';
  let cursor = tbl.start;
  rows.forEach((row, r) => {
    out += xml.slice(cursor, row.start);
    cursor = row.end;
    if (dropRows.has(r)) return;
    const cellEdits = edits.get(r);
    if (!cellEdits) { out += row.xml; return; }
    let rowXml = '';
    let c0 = 0;
    row.cells.forEach((cell, i) => {
      rowXml += row.xml.slice(c0, cell.start);
      rowXml += cellEdits.has(i) ? cellEdits.get(i)(cell.xml) : cell.xml;
      c0 = cell.end;
    });
    out += rowXml + row.xml.slice(c0);
  });
  return out + xml.slice(cursor, tbl.end);
}

// "Nombre: ________" paragraphs outside tables: replace the underscores run.
function tagUnderscoreLines(xml, applied, cfg) {
  return xml.replace(/<w:p(?=[\s>])[\s\S]*?<\/w:p>/g, (p) => {
    const text = textOf(p);
    const m = text.match(/^\s*([^_:]{2,40}?)\s*:?\s*_{3,}\s*$/);
    const tag = m && cfg.labels.get(normalizeLabel(m[1]));
    if (!tag) return p;
    let done = false;
    const next = p.replace(/(<w:t(?:\s[^>]*)?>)([^<]*_{3,}[^<]*)(<\/w:t>)/, (all, open, body, close) => {
      done = true;
      return `${open}${body.replace(/_{3,}/, `{{${tag}}}`)}${close}`;
    });
    if (done) applied.push({ tag, label: m[1].trim() });
    return next;
  });
}

const IMPORTANT = ['date', 'receiverName', '#items', 'receiverSignature', 'delivererSignature'];

export function suggestDocxTags(buffer) {
  return suggestDocxTagsWithLabels(buffer, { ...CUSTODY_CONFIG, important: IMPORTANT });
}

// Same engine with another vocabulary: `labels` maps a normalized label
// (see normalizeLabel) to a scalar tag; optional `itemColumns` (Map) enables
// the repeated-row table, `signatures` ([{ pattern, tag }]) adds image tags
// next to signature labels, and `important` lists the tags reported as
// missing when not placed.
export function suggestDocxTagsWithLabels(buffer, { labels, itemColumns = null, signatures = [], important = [] } = {}) {
  const cfg = { labels: labels instanceof Map ? labels : new Map(Object.entries(labels ?? {})), itemColumns, signatures };
  let zip;
  try { zip = new PizZip(buffer); } catch { throw new TemplateError('El archivo no es un documento de Word válido.'); }
  const file = zip.file('word/document.xml');
  if (!file) throw new TemplateError('El archivo no es un documento de Word válido.');
  const original = file.asText();
  if (/\{\{[^}]+\}\}/.test(textOf(original))) throw new TemplateError('Esta plantilla ya tiene etiquetas; edítala en Word si necesitas cambiarlas.');
  const applied = [];
  // Rewrites are planned on the original XML in document order, then spliced from the end.
  const rewrites = elements(original, 'tbl', original.indexOf('<w:body')).map((tbl) => ({ tbl, xml: rewriteTable(original, tbl, applied, cfg) }));
  let xml = original;
  for (const { tbl, xml: next } of rewrites.reverse()) xml = xml.slice(0, tbl.start) + next + xml.slice(tbl.end);
  xml = tagUnderscoreLines(xml, applied, cfg);
  zip.file('word/document.xml', xml);
  const placed = new Set(applied.map((a) => a.tag));
  return {
    buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
    applied,
    missing: important.filter((tag) => !placed.has(tag)),
  };
}
