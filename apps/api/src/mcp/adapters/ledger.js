import { createLedgerService } from '../../routes/ledger/ledger-service.js';
import { createCategoriesService } from '../../routes/ledger/categories-service.js';
import { createLedgerMiraiQueries } from '../../routes/ledger/ledger-mirai-queries.js';
import { createLedgerMiraiActions } from '../../routes/ledger/mirai-actions.js';
import { createLedgerEffects } from '../../routes/ledger/ledger-effects.js';
import { createGroupService } from '../../routes/ledger/group-service.js';
import { z } from 'zod';
import { pageInput } from '../contracts.js';
import { insist } from '../config.js';

export function createLedgerAdapter({ prisma }) {
  const ledgerService = createLedgerService({ prisma }), categoriesService = createCategoriesService({ prisma });
  return { moduleKey: 'runly.ledger', label: 'Libro de cuentas',
    queries: [...createLedgerMiraiQueries({ prisma, ledgerService, categoriesService }),
      { name: 'ledger_transactions_page', permission: 'ledger.transactions.read', definition: { description: 'Movimientos paginados de una cuenta accesible.' }, inputSchema: z.object({ ...pageInput, accountId: z.uuid(), dateFrom: z.iso.date().optional(), dateTo: z.iso.date().optional() }).strict(), async run(input, a) { await ledgerService.getAccount({ companyId: a.companyId, actorId: a.actorProfileId, accountId: input.accountId }); return ledgerService.listTransactions({ companyId: a.companyId, actorId: a.actorProfileId, ...input, pageSize: input.limit }); } },
      { name: 'ledger_groups', permission: 'ledger.accounts.read', definition: { description: 'Grupos contables accesibles por membresía.' }, inputSchema: z.object({}).strict(), run: (_input, a) => createGroupService({ prisma }).listGroups({ companyId: a.companyId, actorId: a.actorProfileId }) }],
    actions: createLedgerMiraiActions({ prisma, ledgerService, effects: createLedgerEffects({ prisma }) }).filter(a => ['ledger.transaction.create', 'ledger.transaction.update'].includes(a.key)),
    async guard(definition, input, a) {
      if (!definition.key || !input.categoryId) return;
      const categories = (await categoriesService.listCategories({ companyId: a.companyId, actorId: a.actorProfileId })).data;
      insist(categories.some(category => category.id === input.categoryId), 'invalid_relation', 'Selecciona una categoría contable accesible de esta empresa.');
    },
    async revision(_definition, prepared, a) {
      if (!prepared.targetId) return null;
      // prepare already checked company + canWriteAccount. Snapshot only that
      // authorized row, not an unrestricted table or a caller-supplied SQL query.
      return prisma.$queryRaw`SELECT * FROM ledger_transaction WHERE id = ${prepared.targetId}::uuid AND company_id = ${a.companyId}::uuid AND account_id = ${prepared.input.accountId}::uuid`;
    },
    effects: ['Registrar/editar movimientos internos y recalcular saldos del libro. Sin pagos, transferencias externas ni eliminación.'],
  };
}
