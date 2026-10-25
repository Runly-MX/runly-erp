// The documents hub: kind registry, file store, file template service and
// engine, built once at API boot. Other modules receive `hub` (or
// `hub.engine` / `hub.kinds`) from index.js instead of calling over HTTP:
//   hub.kinds.register({ key, label, schema, permissionKey, load, ... })
//   await hub.engine.generate({ companyId, kind, templateId?, data|sourceId, output, ... })
import { createDocumentEngine } from "./document-engine.js";
import { createDocumentFileStore } from "./document-file-store.js";
import { createDocumentFileTemplateService } from "./document-file-template-service.js";
import { createInventoryCustodyDocumentKind } from "./kinds/inventory-custody-kind.js";
import { createLmsCertificateDocumentKind } from "./kinds/lms-certificate-kind.js";
import { createKindRegistry } from "./kinds/kind-registry.js";
import { createGrowthLeadDocumentKind } from "./kinds/growth-lead-kind.js";

export function createDocumentsHub({ prisma, supabaseAdmin }) {
  const kinds = createKindRegistry();
  kinds.register(createGrowthLeadDocumentKind({ prisma }));
  kinds.register(createInventoryCustodyDocumentKind({ prisma }));
  kinds.register(createLmsCertificateDocumentKind({ prisma }));
  const files = createDocumentFileStore({ prisma, supabaseAdmin });
  const fileTemplates = createDocumentFileTemplateService({ prisma, files, kinds });
  const engine = createDocumentEngine({ prisma, files, kinds });
  return { kinds, files, fileTemplates, engine };
}
