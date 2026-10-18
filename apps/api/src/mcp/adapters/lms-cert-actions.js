// Certificate templates of the runly.lms MCP domain: an assistant turns a
// Word (.docx), PowerPoint (.pptx) or PDF file already in Runly (imported with
// runly_files_import_* or uploaded to Archivos) into a certificate template.
// Same rules as the app upload: a Word/PowerPoint file without {{tags}} gets
// the suggested tags placed and a PDF its detected fields, unless autoTag is
// false. Issuing certificates stays in the app.
import { z } from 'zod';
import { createFilesService } from '../../services/files-service.js';
import { createLmsCertService } from '../../routes/lms/lms-cert-service.js';
import { autoTagTemplate, createLmsCertFiles, detectCertLayout, inspectTemplateBuffer } from '../../routes/lms/lms-cert-templates.js';
import { CERT_DOCX_IMAGE_TAGS, CERT_DOCX_SCALAR_TAGS } from '../../routes/lms/lms-cert-docx.js';
import { FIELD_LABELS } from '../../routes/lms/lms-cert-pdf-layout.js';
import { digest } from '../state.js';
import { insist } from '../config.js';
import { clip } from './lms-common.js';

const MANAGE = 'lms.course.manage';
export const CERTIFICATES_LINK = '/app/m/runly.lms/certificates';
const MIME_FORMATS = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/pdf': 'pdf',
};

// What an assistant needs to write a template that works without review.
export const CERT_TAG_GUIDE = [
  `Etiquetas de texto (Word/PowerPoint, con doble llave): ${CERT_DOCX_SCALAR_TAGS.map(tag => `{{${tag}}}`).join(', ')}; además {{campo_<clave>}} imprime una respuesta del formulario del enlace compartido.`,
  `Imágenes: ${CERT_DOCX_IMAGE_TAGS.map(tag => `{{%${tag}}}`).join(', ')} (código QR de verificación, firma de la plantilla, logo de la empresa). En PowerPoint cada imagen va sola en su propio cuadro de texto; en Word, sola en su párrafo o celda.`,
  'Mínimo recomendado: {{alumno}}, {{curso}}, {{fecha}}, {{folio}} y {{%qr}}. Sin etiquetas, Runly intenta colocarlas solo (textos como «Se otorga a ____», [Curso], Fecha:, Folio:).',
  'PDF: no lleva etiquetas; Runly detecta dónde van los datos (también reconoce [NOMBRE], «Curso» o líneas ____ con su rótulo) y se ajustan en el editor de campos de la app.',
].join('\n');

const label = tag => FIELD_LABELS[String(tag).replace(/^%/, '')] ?? tag;
const formatOf = asset => MIME_FORMATS[String(asset.mimeType ?? '').toLowerCase()] ?? /\.(docx|pptx|pdf)$/i.exec(String(asset.originalName ?? ''))?.[1].toLowerCase() ?? null;

// sources: { get(a, fileId) -> FileAsset, read(asset) -> Buffer } (tests).
export function createLmsCertActions({ prisma, supabaseAdmin = null, sources = null, certFiles = null }) {
  const storage = createLmsCertFiles({ prisma, supabaseAdmin });
  const files = sources ?? {
    // Files permissions decide which file the person may use (RESTRICTED included).
    get: (a, id) => createFilesService({ prisma }).getById({ authUserId: a.actorAuthUserId, activeContext: { companyId: a.companyId, profileId: a.actorProfileId, isAdmin: a.isAdmin, permissionSet: a.permissionSet }, id }),
    read: asset => storage.read(asset),
  };

  // The file, its inspection and what the upload would recognize; nothing saved.
  async function analyze(a, input) {
    let asset;
    try { asset = await files.get(a, input.fileId); } catch (error) { insist(!(error.status >= 400 && error.status < 500), 'not_found', 'El archivo no existe o no tienes acceso.', 404); throw error; }
    insist(asset && asset.enabled !== false, 'not_found', 'El archivo no existe o no tienes acceso.', 404);
    const format = formatOf(asset);
    insist(format, 'invalid_request', 'La plantilla debe ser un archivo de Word (.docx), PowerPoint (.pptx) o PDF.');
    const buffer = await files.read(asset);
    const base = String(asset.originalName ?? 'plantilla').replace(/\.[^.]+$/, '').slice(0, 200) || 'plantilla';
    const read = await inspectTemplateBuffer(buffer, `${base}.${format}`, format);
    const autoTag = input.autoTag !== false;
    const tagged = autoTag ? (await autoTagTemplate(read)).autoTag : null;
    const layout = autoTag && format === 'pdf' && read.page ? await detectCertLayout(buffer, read.page, { soft: true }) : null;
    return { asset, buffer, read, format, tagged, layout, sha256: digest(buffer) };
  }

  function summary({ read, format, tagged, layout }) {
    if (format === 'pdf') return { recognized: (layout?.matched ?? []).map(item => item.key), missing: layout?.missing ?? [], fieldCount: layout?.fields.length ?? 0 };
    if (tagged) return { recognized: [...new Set(tagged.applied.map(item => item.tag))], missing: tagged.missing, unplaced: tagged.unplaced, autoTagged: tagged.saved };
    return { recognized: read.tags, missing: [], autoTagged: false };
  }

  return [
    { key: 'lms.certificate_template.create', permission: MANAGE, operation: 'create', label: 'Crear plantilla de certificado desde un archivo',
      description: [
        'Crear una plantilla de certificado con un archivo .docx, .pptx o .pdf que ya está en Runly. Para un archivo del chat: runly_files_import_prepare/commit sin destino y usa aquí el id del archivo guardado.',
        'Word/PowerPoint sin etiquetas: se colocan las sugeridas automáticamente (autoTag:false lo evita); con etiquetas se guarda tal cual. PDF: se detectan los campos. La propuesta muestra los campos reconocidos y los que faltan.',
        'Después asígnala a un curso con lms.course.update (data.certificateTemplateId). Emitir certificados se hace en la app.',
        CERT_TAG_GUIDE,
      ].join('\n'),
      inputSchema: z.strictObject({
        fileId: z.uuid().describe('ID del archivo en Runly (resultado de runly_files_import_commit o de Archivos).'),
        name: z.string().trim().min(1).max(120).optional().describe('Nombre de la plantilla; por defecto, el del archivo.'),
        autoTag: z.boolean().optional().describe('false: no colocar etiquetas ni detectar campos automáticamente (por defecto true).'),
      }),
      async prepare(input, a) {
        const result = await analyze(a, input);
        const { asset, read, format, tagged, sha256 } = result;
        const info = summary(result);
        const name = input.name ?? (String(asset.originalName ?? '').replace(/\.(docx|pptx|pdf)$/i, '').slice(0, 120) || 'Plantilla de certificado');
        const fields = [
          { label: 'Nombre', value: name },
          { label: 'Archivo', value: `${clip(asset.originalName, 120)} (${format.toUpperCase()}, ${read.buffer.length} bytes)` },
          format === 'pdf'
            ? { label: 'Campos detectados', value: info.recognized.length ? info.recognized.map(label).join(', ') : 'Ninguno; se colocan en el editor de campos de la app.' }
            : tagged?.saved
              ? { label: 'Etiquetas que se colocarán', value: clip(tagged.applied.map(item => `${item.label || label(item.tag)} → {{${item.tag}}}`).join(' · '), 600) }
              : { label: 'Etiquetas', value: read.tags.length ? read.tags.map(tag => `{{${tag}}}`).join(', ') : 'Sin etiquetas: el certificado saldrá sin datos hasta que las agregues.' },
          ...(info.missing.length ? [{ label: 'No se encontró dónde poner', value: info.missing.map(label).join(', ') }] : []),
          ...(info.unplaced?.length ? [{ label: 'Textos no reconocidos', value: clip(info.unplaced.join(' · '), 400) }] : []),
        ];
        return { input: { ...input, name, sha256 }, targetId: null, preview: { title: 'Nueva plantilla de certificado', fields } };
      },
      async execute(input, a) {
        const result = await analyze(a, input);
        insist(result.sha256 === input.sha256, 'proposal_stale', 'El archivo cambió. Prepara otra propuesta.', 409);
        const service = createLmsCertService({ prisma, supabaseAdmin, files: certFiles ?? storage });
        const saved = await service.uploadTemplateFile(a.companyId, a.actorProfileId, {
          buffer: result.buffer, fileName: `${result.asset.originalName?.replace(/\.[^.]+$/, '') || 'plantilla'}.${result.format}`, name: input.name, format: result.format, autoTag: input.autoTag !== false,
        });
        const t = saved.template;
        return {
          id: t.id, name: t.name, source: t.source, tags: t.placeholders, fieldCount: t.fieldCount, warnings: saved.warnings,
          ...summary(result), link: CERTIFICATES_LINK,
        };
      } },
  ];
}
