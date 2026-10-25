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
import { createGeneralManualDocumentKind } from "./kinds/general-manual-kind.js";
import { createHrEmployeeDocumentKind } from "./kinds/hr-employee-kind.js";
import { createContactsContactDocumentKind } from "./kinds/contacts-contact-kind.js";
import { createPurchasesOrderDocumentKind } from "./kinds/purchases-order-kind.js";
import { createFleetVehicleDocumentKind } from "./kinds/fleet-vehicle-kind.js";
import { createGrowthLeadDocumentKind } from "./kinds/growth-lead-kind.js";
import { createBuilderKindSync } from "./kinds/builder-kinds.js";

// The hub the API booted with, for MirAI / MCP capabilities built far from index.js.
let shared = null;
export const getSharedDocumentsHub = () => shared;

export function createDocumentsHub({ prisma, supabaseAdmin }) {
  const kinds = createKindRegistry();
  kinds.register(createGeneralManualDocumentKind());
  kinds.register(createGrowthLeadDocumentKind({ prisma }));
  kinds.register(createHrEmployeeDocumentKind({ prisma }));
  kinds.register(createContactsContactDocumentKind({ prisma }));
  kinds.register(createPurchasesOrderDocumentKind({ prisma }));
  kinds.register(createFleetVehicleDocumentKind({ prisma }));
  kinds.register(createInventoryCustodyDocumentKind({ prisma }));
  kinds.register(createLmsCertificateDocumentKind({ prisma }));
  const files = createDocumentFileStore({ prisma, supabaseAdmin });
  const fileTemplates = createDocumentFileTemplateService({ prisma, files, kinds });
  const engine = createDocumentEngine({ prisma, files, kinds });
  // Builder (RME3) modules declare kinds in their manifest; call after a module is installed, enabled, disabled or removed.
  const builderKinds = createBuilderKindSync({ prisma, kinds });
  const syncBuilderKinds = () => builderKinds.sync();
  // Modules installed on the instance, enabled and not switched off for the company: Map(key -> name).
  async function activeModules(companyId, moduleKeys) {
    const rows = await prisma.runlyModule.findMany({
      where: { key: { in: moduleKeys }, status: "INSTALLED", enabled: true },
      select: { id: true, key: true, name: true },
    });
    const off = rows.length
      ? await prisma.companyModule.findMany({ where: { companyId, moduleId: { in: rows.map((r) => r.id) }, enabled: false }, select: { moduleId: true } })
      : [];
    const disabled = new Set(off.map((r) => r.moduleId));
    return new Map(rows.filter((r) => !disabled.has(r.id)).map((r) => [r.key, r.name]));
  }
  const hub = { kinds, files, fileTemplates, engine, syncBuilderKinds, activeModules };
  shared ??= hub;
  return hub;
}
