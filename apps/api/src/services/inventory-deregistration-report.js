// Bitácora de bajas: one row per authorized (or migrated) baja, with when it was
// proposed and authorized, by whom, why, and the acta that backs it.
import { z } from 'zod';
import { assertCompany } from './inventory-guards.js';
import { scopeWhere } from './inventory-scope.js';
import { createInventorySearch } from './inventory-search-service.js';
import { tokenizeSearch } from '../lib/search-tokens.js';
import { DEREGISTRATION_REASONS } from './inventory-admin-service.js';

const BAJA_ACTIONS = ['approve_deregistration', 'migrated'];
const personName = (user) => user?.displayName?.trim() || [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || null;

export const deregistrationFiltersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  reason: z.enum(DEREGISTRATION_REASONS).optional(),
  // current: still deregistered | reverted: the baja was undone | all
  state: z.enum(['current', 'reverted', 'all']).default('current'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export function createInventoryDeregistrationReport({ prisma }) {
  const search = createInventorySearch({ prisma });

  async function list(companyId, rawFilters = {}, scope = null) {
    assertCompany(companyId);
    const f = deregistrationFiltersSchema.parse(rawFilters);
    const itemWhere = { enabled: true, ...(scopeWhere(scope) ?? {}) };
    if (f.state === 'current') itemWhere.adminStatus = 'deregistered';
    if (f.state === 'reverted') itemWhere.adminStatus = { not: 'deregistered' };
    const term = f.search ?? '';
    const where = { companyId, action: { in: BAJA_ACTIONS }, item: itemWhere };
    if (f.reason) where.reason = f.reason;
    if (f.from || f.to) where.effectiveDate = { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T00:00:00Z`) } : {}) };
    if (term) {
      const folioActs = await prisma.invDeregistrationAct.findMany({ where: { companyId, folio: { contains: term, mode: 'insensitive' } }, select: { id: true } });
      const ids = tokenizeSearch(term).length ? await search.searchItemIds(companyId, term) : [];
      where.OR = [{ itemId: { in: ids } }, ...(folioActs.length ? [{ actId: { in: folioActs.map((a) => a.id) } }] : [])];
    }
    const [total, events] = await Promise.all([
      prisma.invItemAdminEvent.count({ where }),
      prisma.invItemAdminEvent.findMany({
        where, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], skip: (f.page - 1) * f.pageSize, take: f.pageSize,
        include: {
          item: { select: { id: true, name: true, assetTag: true, serialNumber: true, adminStatus: true, category: { select: { name: true } } } },
          actor: { select: { displayName: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    const actIds = [...new Set(events.map((e) => e.actId).filter(Boolean))];
    const itemIds = events.map((e) => e.itemId);
    const [acts, proposals] = await Promise.all([
      actIds.length ? prisma.invDeregistrationAct.findMany({ where: { id: { in: actIds }, companyId }, select: { id: true, folio: true, documentFileId: true, signatureFileId: true, itemCount: true, approverTitle: true } }) : [],
      itemIds.length ? prisma.invItemAdminEvent.findMany({
        where: { companyId, itemId: { in: itemIds }, action: 'propose_deregistration' }, orderBy: { createdAt: 'desc' },
        include: { actor: { select: { displayName: true, firstName: true, lastName: true } } },
      }) : [],
    ]);
    const actById = new Map(acts.map((a) => [a.id, a]));
    const data = events.map((e) => {
      const act = e.actId ? actById.get(e.actId) : null;
      const proposal = proposals.find((p) => p.itemId === e.itemId && p.createdAt <= e.createdAt);
      return {
        eventId: e.id, itemId: e.itemId, name: e.item.name, assetTag: e.item.assetTag, serialNumber: e.item.serialNumber, category: e.item.category?.name ?? null,
        reason: e.reason, effectiveDate: e.effectiveDate, authorizedAt: e.createdAt,
        authorizedBy: e.actor ? personName(e.actor) : 'Migración', comment: e.comment, migrated: e.action === 'migrated',
        proposedBy: proposal ? personName(proposal.actor) : null, proposedAt: proposal?.createdAt ?? null, proposalComment: proposal?.comment ?? null,
        reverted: e.item.adminStatus !== 'deregistered', batchId: e.batchId, batchSize: e.batchSize,
        act: act ? { id: act.id, folio: act.folio, hasDocument: Boolean(act.documentFileId), signed: Boolean(act.signatureFileId), itemCount: act.itemCount } : null,
      };
    });
    return { data, total, page: f.page, pageSize: f.pageSize };
  }

  // Counts of the items currently in baja, for the header tiles.
  async function summary(companyId, scope = null) {
    assertCompany(companyId);
    const base = { companyId, enabled: true, adminStatus: 'deregistered', ...(scopeWhere(scope) ?? {}) };
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const [total, thisMonth, thisYear, byReason, withoutAct] = await Promise.all([
      prisma.invItem.count({ where: base }),
      prisma.invItem.count({ where: { ...base, deregisteredAt: { gte: monthStart } } }),
      prisma.invItem.count({ where: { ...base, deregisteredAt: { gte: yearStart } } }),
      prisma.invItem.groupBy({ by: ['deregistrationReason'], where: base, _count: { _all: true } }),
      prisma.invItemAdminEvent.count({ where: { companyId, action: 'approve_deregistration', actId: null, item: { ...(scopeWhere(scope) ?? {}), enabled: true, adminStatus: 'deregistered' } } }),
    ]);
    return {
      total, thisMonth, thisYear, withoutAct,
      byReason: byReason.map((r) => ({ reason: r.deregistrationReason ?? 'other', count: r._count._all })).sort((a, b) => b.count - a.count),
    };
  }

  return { list, summary };
}
