// `wipe` command: empties the Inventory and Purchases modules of ONE company
// (items, assignments, resguardos, their files, comments and relations; purchase
// cases/orders/invoices and the rest of the purchase flow). Catalogs (types,
// brands, locations, models, custom fields, templates), employees, suppliers and
// everything else stay. DESTRUCTIVE, so:
//   - default is a dry run that only counts;
//   - --commit needs --confirm <the same company uuid>;
//   - it refuses companies that hold migrated data (legacy_ref rows: use `rollback`);
//   - it refuses more than WIPE_LIMIT items unless --allow-many.
// Database rows go in ONE transaction; stored files are removed after it commits.
import { openRun } from './migrate.mjs'

export const WIPE_LIMIT = 100
const CHUNK = 500
const chunks = (list) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK))

// Counts everything the wipe would remove and gathers the ids it needs.
export async function planWipe(prisma, companyId) {
  const [itemRows, custodyRows, orderRows, invoiceRows, caseRows, requestRows, quoteRows, receiptRows, approvalRows] = await Promise.all([
    prisma.invItem.findMany({ where: { companyId }, select: { id: true } }),
    prisma.invCustody.findMany({ where: { companyId }, select: { id: true, documentFileId: true, receiverSignatureFileId: true, delivererSignatureFileId: true } }),
    prisma.purchaseOrder.findMany({ where: { companyId }, select: { id: true } }),
    prisma.purchaseInvoice.findMany({ where: { companyId }, select: { id: true } }),
    prisma.purchaseCase.findMany({ where: { companyId }, select: { id: true } }),
    prisma.purchaseRequest.findMany({ where: { companyId }, select: { id: true } }),
    prisma.purchaseQuote.findMany({ where: { companyId }, select: { id: true } }),
    prisma.purchaseReceipt.findMany({ where: { companyId }, select: { id: true } }),
    prisma.purchaseApproval.findMany({ where: { companyId }, select: { id: true } }),
  ]);
  const itemIds = itemRows.map((r) => r.id);
  const purchaseIds = [...orderRows, ...invoiceRows, ...caseRows, ...requestRows, ...quoteRows, ...receiptRows, ...approvalRows].map((r) => r.id);
  const [assignments, itemFiles, purchaseFiles, lines, allocations, stages, comments, legacyRefs, scopedAssets] = await Promise.all([
    prisma.invAssignment.count({ where: { item: { companyId } } }),
    prisma.invItemFile.findMany({ where: { item: { companyId } }, select: { fileAssetId: true } }),
    prisma.purchaseFile.findMany({ where: { companyId }, select: { fileAssetId: true } }),
    prisma.purchaseLine.count({ where: { companyId } }),
    prisma.purchaseAllocation.count({ where: { companyId } }),
    prisma.purchaseStageRecord.count({ where: { companyId } }),
    prisma.entityComment.count({ where: { companyId, entityType: 'InvItem' } }),
    prisma.legacyRef.count({ where: { companyId } }),
    // Files stored for these two modules at company scope (not linked through a table):
    // every purchases file, and inventory files of items and resguardos (never templates).
    prisma.fileAsset.findMany({
      where: { entityId: companyId, OR: [{ moduleKey: 'runly.purchases' }, { moduleKey: 'runly.inventory', entityType: { in: ['InvItem', 'InvCustody'] } }] },
      select: { id: true },
    }),
  ]);
  const fileIds = new Set([
    ...itemFiles.map((r) => r.fileAssetId), ...purchaseFiles.map((r) => r.fileAssetId),
    ...custodyRows.flatMap((r) => [r.documentFileId, r.receiverSignatureFileId, r.delivererSignatureFileId]),
    ...scopedAssets.map((r) => r.id),
  ].filter(Boolean));
  return {
    itemIds, purchaseIds, custodyIds: custodyRows.map((r) => r.id), fileIds: [...fileIds],
    counts: {
      'Inventarios': itemIds.length, 'Asignaciones': assignments, 'Resguardos': custodyRows.length, 'Comentarios de inventarios': comments,
      'Archivos (inventario, resguardos y compras)': fileIds.size,
      'Expedientes de compra': caseRows.length, 'Ordenes de compra': orderRows.length, 'Facturas': invoiceRows.length, 'Solicitudes': requestRows.length,
      'Cotizaciones': quoteRows.length, 'Recepciones': receiptRows.length, 'Aprobaciones': approvalRows.length, 'Partidas': lines,
      'Asignaciones de gasto': allocations, 'Etapas de compra': stages,
    },
    legacyRefs,
  };
}

// Deletes the database rows in one transaction and returns the storage keys to remove afterwards.
export async function executeWipe(prisma, companyId, plan) {
  const assets = plan.fileIds.length ? await prisma.fileAsset.findMany({ where: { id: { in: plan.fileIds } }, select: { id: true, objectKey: true } }) : [];
  await prisma.$transaction(async (tx) => {
    await tx.invCustody.deleteMany({ where: { companyId } });
    await tx.invAssignment.deleteMany({ where: { item: { companyId } } });
    await tx.entityComment.deleteMany({ where: { companyId, entityType: 'InvItem' } });
    for (const part of chunks([...plan.itemIds, ...plan.purchaseIds])) {
      await tx.entityRelation.deleteMany({ where: { companyId, OR: [{ sourceId: { in: part } }, { targetId: { in: part } }] } });
    }
    await tx.invItemFile.deleteMany({ where: { item: { companyId } } });
    await tx.invItem.deleteMany({ where: { companyId } });
    await tx.purchaseAllocation.deleteMany({ where: { companyId } });
    await tx.purchaseReceipt.deleteMany({ where: { companyId } }); // receipt lines cascade
    await tx.purchaseApproval.deleteMany({ where: { companyId } });
    await tx.purchaseQuote.deleteMany({ where: { companyId } });
    await tx.purchaseRequest.deleteMany({ where: { companyId } });
    await tx.purchaseStageRecord.deleteMany({ where: { companyId } });
    await tx.purchaseLine.deleteMany({ where: { companyId } });
    await tx.purchaseFile.deleteMany({ where: { companyId } });
    await tx.purchaseInvoice.deleteMany({ where: { companyId } });
    await tx.purchaseOrder.deleteMany({ where: { companyId } });
    await tx.purchaseCase.deleteMany({ where: { companyId } });
    for (const part of chunks(assets.map((a) => a.id))) await tx.fileAsset.deleteMany({ where: { id: { in: part } } });
  }, { timeout: 300_000, maxWait: 30_000 });
  return assets.map((a) => a.objectKey).filter(Boolean);
}

export async function runWipe(options, log = () => {}) {
  if (!options.company) throw new Error('wipe: --company es obligatorio');
  const commit = Boolean(options.commit);
  if (commit && options.confirm !== options.company) throw new Error('wipe --commit: repite el id de la empresa con --confirm <id> para confirmar.');
  const run = await openRun(options, { needSource: false, needStorage: commit });
  try {
    const company = await run.prisma.company.findUnique({ where: { id: options.company }, select: { name: true } });
    const plan = await planWipe(run.prisma, options.company);
    log(`Empresa: ${company?.name ?? '(sin nombre)'}`);
    log(commit ? 'MODO: BORRAR' : 'MODO: simulación (no se borra nada)');
    for (const [label, count] of Object.entries(plan.counts)) log(`  ${label}: ${count}`);
    if (plan.legacyRefs) {
      log(`\nSe detuvo: esta empresa tiene ${plan.legacyRefs} registros migrados (legacy_ref). Para deshacer una migración usa el comando rollback, no wipe.`);
      return 1;
    }
    if (plan.itemIds.length > WIPE_LIMIT && !options.allowMany) {
      log(`\nSe detuvo: hay más de ${WIPE_LIMIT} inventarios. Si de verdad quieres borrarlos todos, agrega --allow-many.`);
      return 1;
    }
    if (!commit) {
      log('\nNo se borró nada. Para borrar: repite el comando con --commit --confirm <id de la empresa>.');
      return 0;
    }
    const keys = await executeWipe(run.prisma, options.company, plan);
    const removed = await run.removeObjects(keys);
    log(`\nBorrado. Archivos eliminados del almacenamiento: ${removed} de ${keys.length}.`);
    return removed < keys.length ? 1 : 0;
  } finally {
    await run.close();
  }
}
