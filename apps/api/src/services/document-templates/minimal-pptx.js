// Builds a minimal valid one-slide .pptx (presentation, master, layout, theme
// and one slide) from PresentationML shape XML. Used by the sample LMS
// certificate and by tests. Sizes are EMU (914400 per inch, 12700 per point).
import PizZip from 'pizzip';
import { escapeXml } from './minimal-docx.js';

export const EMU_PER_PT = 12700;
export const SLIDE_16_9 = { cx: 12192000, cy: 6858000 };

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument';

const rels = (items) => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')
  + '</Relationships>';

const CONTENT_TYPES = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Default Extension="png" ContentType="image/png"/>'
  + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
  + `<Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentationml.presentation.main+xml"/>`
  + `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.presentationml.slideMaster+xml"/>`
  + `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}.presentationml.slideLayout+xml"/>`
  + `<Override PartName="/ppt/slides/slide1.xml" ContentType="${CT}.presentationml.slide+xml"/>`
  + `<Override PartName="/ppt/theme/theme1.xml" ContentType="${CT}.theme+xml"/>`
  + '</Types>';

const EMPTY_TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
  + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const COLORS = [['dk1', '000000'], ['lt1', 'FFFFFF'], ['dk2', '1F2937'], ['lt2', 'F3F4F6'], ['accent1', '4F46E5'], ['accent2', '0EA5E9'],
  ['accent3', '10B981'], ['accent4', 'F59E0B'], ['accent5', 'EF4444'], ['accent6', '8B5CF6'], ['hlink', '2563EB'], ['folHlink', '7C3AED']];
const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
const line = '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>';
const THEME = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Runly"><a:themeElements>`
  + `<a:clrScheme name="Runly">${COLORS.map(([k, v]) => `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`).join('')}</a:clrScheme>`
  + '<a:fontScheme name="Runly"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
  + '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
  + `<a:fmtScheme name="Runly"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${line}${line}${line}</a:lnStyleLst>`
  + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
  + `<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" '
  + 'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

// A text box. size in points; align l | ctr | r; color hex without #.
export function textBox(text, { x, y, cx, cy, size = 18, bold = false, align = 'ctr', color = '111827', name = 'Texto' }) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="0" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
    + '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/>'
    + `<a:p><a:pPr algn="${align}"/><a:r><a:rPr lang="es-MX" sz="${Math.round(size * 100)}"${bold ? ' b="1"' : ''} dirty="0">`
    + `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

// An unfilled rectangle (frame). width in points.
export function frame({ x, y, cx, cy, color = '4F46E5', width = 4 }) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="0" name="Marco"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`
    + `<a:noFill/><a:ln w="${Math.round(width * EMU_PER_PT)}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></p:spPr></p:sp>`;
}

export function buildMinimalPptx(shapesXml, { cx = SLIDE_16_9.cx, cy = SLIDE_16_9.cy } = {}) {
  let id = 1;
  const shapes = String(shapesXml).replace(/<p:cNvPr id="0" name="([^"]*)"/g, (_, name) => { id += 1; return `<p:cNvPr id="${id}" name="${name} ${id}"`; });
  const zip = new PizZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]));
  zip.file('ppt/presentation.xml', `${XML}<p:presentation ${NS} saveSubsetFonts="1">`
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
    + '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>'
    + `<p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', rels([
    ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'slide', 'slides/slide1.xml'], ['rId3', 'theme', 'theme/theme1.xml'],
  ]));
  zip.file('ppt/slideMasters/slideMaster1.xml', `${XML}<p:sldMaster ${NS}><p:cSld><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>${CLR_MAP}`
    + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>');
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
  zip.file('ppt/slideLayouts/slideLayout1.xml', `${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="En blanco"><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>`
    + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>');
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
  zip.file('ppt/theme/theme1.xml', THEME);
  zip.file('ppt/slides/slide1.xml', `${XML}<p:sld ${NS}><p:cSld><p:spTree>${EMPTY_TREE}${shapes}</p:spTree></p:cSld>`
    + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>');
  zip.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
