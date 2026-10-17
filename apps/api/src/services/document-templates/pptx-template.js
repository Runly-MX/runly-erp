// .pptx template engine: the same docxtemplater + image module setup as the
// .docx engine (docxtemplater detects the file type from the package).
//
// Image tags (`{{%qr}}`) replace the WHOLE text box that contains them with a
// picture at the box's position (docxtemplater-image-module-free pptx mode),
// so an image tag must sit alone in its own text box. The picture is fitted
// inside that box keeping its aspect ratio. A missing image becomes a 1x1
// transparent PNG, so the box simply disappears.
import PizZip from 'pizzip';
import { build, describeCompileError } from './docx-template.js';
import { TemplateError, TAG_PATTERN, collectTags } from './template-tags.js';

const SLIDE = /^ppt\/slides\/slide(\d+)\.xml$/;
const EMU_PER_PX = 9525;
export const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

function loadZip(buffer) {
  try {
    return new PizZip(buffer);
  } catch {
    throw new TemplateError('El archivo no es una presentación de PowerPoint (.pptx) válida.');
  }
}

// Slide part names in slide order (slide2 before slide10).
export function slideNames(zip) {
  return Object.keys(zip.files)
    .filter((name) => SLIDE.test(name))
    .sort((a, b) => Number(a.match(SLIDE)[1]) - Number(b.match(SLIDE)[1]));
}

// Visible text of a slide, one line per paragraph.
export const slideText = (xml) => String(xml)
  .replace(/<a:br\/>/g, ' ').replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function assertPptx(zip) {
  if (!zip.file('ppt/presentation.xml') || !slideNames(zip).length) {
    throw new TemplateError('El archivo no es una presentación de PowerPoint (.pptx) válida.');
  }
}

// Validates the template (compile) and returns the tags it uses.
export function inspectPptx(buffer) {
  const zip = loadZip(buffer);
  assertPptx(zip);
  build(zip);
  return { tags: collectTags(slideNames(zip).map((name) => slideText(zip.file(name).asText()))) };
}

// Sequential shape ids (cNvPr) inside a slide.
export function renumberShapeIds(xml) {
  let id = 0;
  return String(xml).replace(/<p:cNvPr id="\d+"/g, () => { id += 1; return `<p:cNvPr id="${id}"`; });
}

// Box size in pixels of the text box holding each image tag ({ qr: [w, h] }).
export function pptxImageBoxes(buffer) {
  const zip = buffer instanceof PizZip ? buffer : loadZip(buffer);
  const boxes = {};
  for (const name of slideNames(zip)) {
    for (const shape of zip.file(name).asText().match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []) {
      const ext = shape.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
      if (!ext) continue;
      for (const m of slideText(shape).matchAll(TAG_PATTERN)) {
        const key = m[1] === '%' ? m[2].replace(/^%/, '').trim() : null;
        if (key && !boxes[key]) boxes[key] = [Math.max(1, Math.round(Number(ext[1]) / EMU_PER_PX)), Math.max(1, Math.round(Number(ext[2]) / EMU_PER_PX))];
      }
    }
  }
  return boxes;
}

// `images` maps an image key to a PNG/JPEG buffer, as renderDocx does.
// `imageSize(key, tagName, box)` returns [w, h] in pixels; box is the text box size.
export function renderPptx(buffer, data, { images = {}, imageSize = null } = {}) {
  const zip = loadZip(buffer);
  assertPptx(zip);
  const boxes = pptxImageBoxes(zip);
  const getImage = (key) => (images[key]?.length ? images[key] : BLANK_PNG);
  const size = (key, tagName) => {
    if (!images[key]?.length) return [1, 1];
    const box = boxes[String(tagName ?? '').replace(/^%+/, '')] ?? boxes[key] ?? null;
    return imageSize ? imageSize(key, tagName, box) : (box ?? [200, 80]);
  };
  // Missing images still need a value so the tag's box is replaced (by a 1x1 blank).
  const filled = { ...data };
  for (const m of slideNames(zip).map((name) => slideText(zip.file(name).asText())).join('\n').matchAll(TAG_PATTERN)) {
    if (m[1] !== '%') continue;
    const name = m[2].replace(/^%/, '').trim();
    if (!filled[name]) { filled[name] = `__blank_${name}` }
  }
  const doc = build(zip, { images: new Proxy({}, { get: (_, key) => getImage(String(key)) }), imageSize: size });
  try {
    doc.render(filled);
  } catch (err) {
    throw new TemplateError(describeCompileError(err));
  }
  // The image module gives every picture the same shape id; keep them unique.
  const out = doc.getZip();
  for (const name of slideNames(out)) out.file(name, renumberShapeIds(out.file(name).asText()));
  return out.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
