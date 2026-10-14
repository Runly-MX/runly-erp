// .docx template engine on docxtemplater with `{{ }}` delimiters.
//
// Data values are plain strings/arrays; dotted tags (`company.name`) resolve
// as paths. Image tags (`{{%receiverSignature}}`) take the PNG buffer from
// `options.images[name]`; a missing image renders as empty text.
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import { TemplateError, collectTags, resolvePath } from './template-tags.js';

const DEFAULT_IMAGE_SIZE = [220, 88];
const SCANNED_PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/;

function loadZip(buffer) {
  try {
    return new PizZip(buffer);
  } catch {
    throw new TemplateError('El archivo no es un documento Word (.docx) válido.');
  }
}

function describeCompileError(err) {
  const first = err?.properties?.errors?.[0] ?? err;
  const id = first?.properties?.id;
  const tag = first?.properties?.xtag ?? first?.properties?.context;
  const where = tag ? ` (cerca de "${String(tag).slice(0, 40)}")` : '';
  if (id === 'unclosed_loop' || id === 'unopened_loop' || id === 'closing_tag_does_not_match_opening_tag') {
    return `La plantilla tiene un bloque {{#...}} sin cerrar o mal cerrado${where}.`;
  }
  if (id === 'unclosed_tag' || id === 'unopened_tag' || id === 'duplicate_open_tag' || id === 'duplicate_close_tag') {
    return `La plantilla tiene una etiqueta {{ }} incompleta${where}.`;
  }
  return `La plantilla no es válida${where}.`;
}

const parser = (tag) => ({ get: (scope) => resolvePath(scope, tag.trim()) });

function build(zip, { images = {}, imageSize = DEFAULT_IMAGE_SIZE } = {}) {
  const imageModule = new ImageModule({
    centered: false,
    fileType: 'docx',
    getImage: (tagValue) => images[tagValue] ?? Buffer.alloc(0),
    getSize: () => imageSize,
  });
  try {
    return new Docxtemplater(zip, {
      modules: [imageModule],
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
      parser,
      nullGetter: () => '',
    });
  } catch (err) {
    throw new TemplateError(describeCompileError(err));
  }
}

// Validates the template (compile) and returns the tags it uses.
export function inspectDocx(buffer) {
  const zip = loadZip(buffer);
  if (!zip.file('word/document.xml')) throw new TemplateError('El archivo no es un documento Word (.docx) válido.');
  build(zip);
  const texts = Object.keys(zip.files)
    .filter((name) => SCANNED_PARTS.test(name))
    .sort((a, b) => (a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b)))
    .map((name) => zip.file(name).asText().replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, ''));
  return { tags: collectTags(texts) };
}

// `images` maps an image key (the value the data gives the image tag) to a
// PNG buffer: data `{ receiverSignature: 'receiverSignature' }` +
// images `{ receiverSignature: <Buffer> }`.
export function renderDocx(buffer, data, { images = {}, imageSize } = {}) {
  const doc = build(loadZip(buffer), { images, imageSize });
  try {
    doc.render(data);
  } catch (err) {
    throw new TemplateError(describeCompileError(err));
  }
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
