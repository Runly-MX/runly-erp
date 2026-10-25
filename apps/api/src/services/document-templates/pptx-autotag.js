// Suggests {{tags}} for a blank company presentation (.pptx). Looks at text
// boxes and table cells in slide order:
//   - "Nombre: ________"   -> the underscores become the tag;
//   - "Nombre:" alone      -> the tag is appended after the label;
//   - a box/cell holding only a known label followed by an empty box/cell
//     -> the tag is written in the empty one.
// Every tag is placed once; whatever cannot be placed is reported as missing.
import PizZip from 'pizzip';
import { normalizeLabel } from './docx-autotag.js';
import { slideNames, slideText } from './pptx-template.js';
import { TemplateError } from './template-tags.js';

const UNIT = /<p:sp>[\s\S]*?<\/p:sp>|<a:tc(?:\s[^>]*)?>[\s\S]*?<\/a:tc>/g;
const PARAGRAPH = /<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>|<a:p\/>/g;
const RUN_PROPS = /<a:rPr[^>]*\/>|<a:rPr[^>]*>[\s\S]*?<\/a:rPr>/g;

const textOf = (xml) => slideText(xml).replace(/\n+$/, '').trim();

// Appends a run with `text` at the end of a paragraph, keeping the last run style.
function appendRun(paragraph, text) {
  const style = [...paragraph.matchAll(RUN_PROPS)].at(-1)?.[0] ?? '';
  const run = `<a:r>${style}<a:t>${text}</a:t></a:r>`;
  if (paragraph === '<a:p/>') return `<a:p>${run}</a:p>`;
  const end = paragraph.search(/<a:endParaRPr|<\/a:p>/);
  return paragraph.slice(0, end) + run + paragraph.slice(end);
}

// Writes into the first paragraph of an empty box/cell.
function fillEmpty(unit, tag) {
  let done = false;
  return unit.replace(PARAGRAPH, (paragraph) => {
    if (done) return paragraph;
    done = true;
    return appendRun(paragraph, `{{${tag}}}`);
  });
}

export function suggestPptxTagsWithLabels(buffer, { labels, important = [] } = {}) {
  const map = labels instanceof Map ? labels : new Map(Object.entries(labels ?? {}));
  let zip;
  try { zip = new PizZip(buffer); } catch { throw new TemplateError('El archivo no es una presentación de PowerPoint (.pptx) válida.'); }
  const names = slideNames(zip);
  if (!zip.file('ppt/presentation.xml') || !names.length) throw new TemplateError('El archivo no es una presentación de PowerPoint (.pptx) válida.');
  if (names.some((name) => /\{\{[^}]+\}\}/.test(slideText(zip.file(name).asText())))) {
    throw new TemplateError('Esta plantilla ya tiene etiquetas; edítala en PowerPoint si necesitas cambiarlas.');
  }
  const applied = [];
  const placed = new Set();
  const place = (tag, label) => { placed.add(tag); applied.push({ tag, label: label.replace(/:\s*$/, '').trim() }); };
  const labelTag = (text) => (text && text.length <= 60 ? map.get(normalizeLabel(text)) : null);

  for (const name of names) {
    const xml = zip.file(name).asText();
    const units = [];
    let cursor = 0;
    let out = '';
    for (const m of xml.matchAll(UNIT)) {
      out += xml.slice(cursor, m.index);
      units.push({ next: m[0] });
      out += '\u0000';
      cursor = m.index + m[0].length;
    }
    out += xml.slice(cursor);

    units.forEach((unit, i) => {
      if (unit.done) return;
      const pars = unit.next.match(PARAGRAPH) ?? [];
      // Paragraph level: "Label: ____" and "Label:".
      unit.next = unit.next.replace(PARAGRAPH, (paragraph) => {
        const text = textOf(paragraph);
        const under = text.match(/^\s*([^_:]{2,40}?)\s*:?\s*_{3,}\s*$/);
        const tag = under && labelTag(normalizeLabel(under[1]));
        if (tag && !placed.has(tag)) {
          let replaced = false;
          const next = paragraph.replace(/(<a:t>)([^<]*_{3,}[^<]*)(<\/a:t>)/, (all, open, body, close) => {
            replaced = true;
            return `${open}${body.replace(/_{3,}/, `{{${tag}}}`)}${close}`;
          });
          if (replaced) { place(tag, under[1]); return next; }
        }
        const colon = text.endsWith(':') ? labelTag(normalizeLabel(text)) : null;
        if (colon && !placed.has(colon) && pars.length === 1) {
          place(colon, text);
          unit.done = true;
          return appendRun(paragraph, ` {{${colon}}}`);
        }
        return paragraph;
      });
      if (unit.done) return;
      // Box/cell level: a lone label followed by an empty box/cell.
      const text = textOf(unit.next);
      const tag = labelTag(normalizeLabel(text));
      const following = units[i + 1];
      if (tag && !placed.has(tag) && following && !textOf(following.next) && /<a:p[\s>/]/.test(following.next)) {
        following.next = fillEmpty(following.next, tag);
        following.done = true;
        place(tag, text);
      }
    });

    let rebuilt = out;
    for (const unit of units) rebuilt = rebuilt.replace('\u0000', () => unit.next);
    zip.file(name, rebuilt);
  }
  return {
    buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
    applied,
    missing: important.filter((tag) => !placed.has(tag)),
  };
}
