import { createDocumentsAdapter as createDocumentFilesAdapter } from './readonly.js';
import { createDocumentsMiraiCapabilities } from '../../routes/documents/mirai-capabilities.js';

// Documentos: files of the documents workspace (read-only) plus the template
// engine: list kinds and templates, and propose generating a document from a
// template (prepare / approve in Runly / commit). Kind permissions and
// template visibility are enforced by the shared capability.
export function createDocumentsAdapter({ prisma, supabaseAdmin }) {
  const files = createDocumentFilesAdapter({ prisma, supabaseAdmin });
  const capability = createDocumentsMiraiCapabilities({ prisma });
  return {
    moduleKey: 'runly.documents', label: 'Documentos',
    queries: [...files.queries, ...capability.tools],
    actions: capability.actions,
    sensitive: false,
    effects: ['Generar un documento desde una plantilla y guardarlo en Archivos de la empresa; no modifica el registro de origen.'],
  };
}
