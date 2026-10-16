import { createLedgerService } from '../../routes/ledger/ledger-service.js';
import { createCategoriesService } from '../../routes/ledger/categories-service.js';
import { createLedgerMiraiQueries } from '../../routes/ledger/ledger-mirai-queries.js';
import { createLedgerMiraiActions } from '../../routes/ledger/mirai-actions.js';
import { createLedgerEffects } from '../../routes/ledger/ledger-effects.js';

export function createLedgerAdapter({ prisma }) {
  const ledgerService = createLedgerService({ prisma }), categoriesService = createCategoriesService({ prisma });
  return { moduleKey: 'runly.ledger', label: 'Libro de cuentas',
    queries: createLedgerMiraiQueries({ prisma, ledgerService, categoriesService }),
    actions: createLedgerMiraiActions({ prisma, ledgerService, effects: createLedgerEffects({ prisma }) }).filter(a => ['ledger.transaction.create', 'ledger.transaction.update'].includes(a.key)),
    async revision(_definition, prepared, a) {
      if (!prepared.targetId) return null;
      // prepare already checked company + canWriteAccount. Snapshot only that
      // authorized row, not an unrestricted table or a caller-supplied SQL query.
      return prisma.$queryRaw`SELECT * FROM ledger_transaction WHERE id = ${prepared.targetId}::uuid AND company_id = ${a.companyId}::uuid AND account_id = ${prepared.input.accountId}::uuid`;
    },
    effects: ['Registrar/editar movimientos internos y recalcular saldos del libro. Sin pagos, transferencias externas ni eliminación.'],
  };
}
