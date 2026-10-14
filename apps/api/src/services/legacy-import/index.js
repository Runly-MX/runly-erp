// Legacy import toolkit: server-side helpers for faithful migrations from
// legacy systems (sinabe first). Internal only: no HTTP route exposes it; a
// migration script running with the API env builds it with
// createLegacyImportToolkit and calls the helpers.
// Spec: docs/superpowers/specs/2026-10-14-legacy-import-toolkit-design.md
import { createLegacyRefs } from './legacy-refs.js';
import { createLegacyFileStore, DEFAULT_MAX_FILE_BYTES, LegacyImportError } from './shared.js';
import { createInventoryHistorical } from './inventory-historical.js';
import { createPurchasesHistorical } from './purchases-historical.js';
import { createCustodyHistorical } from './custody-historical.js';
import { createPeopleAndSuppliers } from './people-and-suppliers.js';
import { extractCfdiUuid } from './cfdi.js';

export { LegacyImportError, extractCfdiUuid };

export function createLegacyImportToolkit({ prisma, supabaseAdmin = null, source, maxFileBytes = DEFAULT_MAX_FILE_BYTES }) {
  if (!prisma) throw new LegacyImportError('prisma es obligatorio.');
  const defaultSource = String(source ?? '').trim();
  if (!defaultSource || defaultSource.length > 40) throw new LegacyImportError('source es obligatorio (máximo 40 caracteres).');
  const refs = createLegacyRefs({ prisma });
  const fileStore = createLegacyFileStore({ supabaseAdmin, maxBytes: maxFileBytes });
  const deps = { prisma, refs, fileStore, defaultSource };
  return {
    source: defaultSource,
    refs,
    ...createInventoryHistorical(deps),
    ...createPurchasesHistorical(deps),
    ...createCustodyHistorical(deps),
    ...createPeopleAndSuppliers(deps),
  };
}
