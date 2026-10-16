import { z } from 'zod';
import { createWalletsService } from '../../routes/pfm/wallets-service.js';
import { createMovementsService } from '../../routes/pfm/movements-service.js';
import { createSummaryService } from '../../routes/pfm/summary-service.js';
import { createBudgetsService } from '../../routes/pfm/budgets-service.js';
import { createCategoriesService } from '../../routes/pfm/categories-service.js';
import { createPfmMiraiQueries } from '../../routes/pfm/pfm-mirai-queries.js';
import { createPfmMiraiActions } from '../../routes/pfm/mirai-actions.js';
import { createBudgetSchema, updateBudgetSchema } from '../../routes/pfm/validators.js';
import { insist } from '../config.js';

export function createPfmAdapter({ prisma }) {
  const wallets = createWalletsService({ prisma }), movements = createMovementsService({ prisma, wallets }), summary = createSummaryService({ prisma }), budgets = createBudgetsService({ prisma }), categories = createCategoriesService({ prisma });
  const ctx = a => ({ companyId: a.companyId, actorId: a.actorProfileId });
  const budgetActions = ['create', 'update'].map(operation => ({
    key: `pfm.budget.${operation}`, operation, permission: 'pfm.budgets.manage', label: 'Guardar presupuesto personal',
    inputSchema: z.object({ ...(operation === 'update' ? { budgetId: z.uuid() } : {}), data: (operation === 'create' ? createBudgetSchema : updateBudgetSchema).strict() }).strict(),
    async prepare(input, a) {
      const current = (await budgets.listBudgets(ctx(a))).data;
      const previous = input.budgetId ? current.find(b => b.id === input.budgetId) : null;
      insist(!input.budgetId || previous, 'not_found', 'Presupuesto no disponible.', 404);
      if (operation === 'create') {
        const allowed = (await categories.listCategories(ctx(a))).data;
        insist(allowed.some(c => c.id === input.data.categoryId && c.isMine), 'invalid_relation', 'Selecciona una categoría personal propia.');
        if (input.data.walletId) await wallets.getWallet({ ...ctx(a), walletId: input.data.walletId });
        insist(!current.some(b => b.categoryId === input.data.categoryId && b.walletId === (input.data.walletId ?? null)), 'duplicate_resource', 'Ya existe un presupuesto para esa categoría y cartera.', 409);
      }
      return { input, targetId: input.budgetId ?? null, preview: { title: 'Guardar presupuesto personal', fields: [{ label: 'Datos', value: JSON.stringify(input.data), ...(previous ? { before: JSON.stringify(previous) } : {}) }] } };
    },
    execute: async (input, a) => operation === 'create' ? budgets.createBudget({ ...ctx(a), data: input.data }) : budgets.updateBudget({ ...ctx(a), budgetId: input.budgetId, data: input.data }),
  }));
  return { moduleKey: 'runly.pfm', label: 'Finanzas personales',
    queries: createPfmMiraiQueries({ prisma, summary, wallets, budgets, categories }),
    actions: [...createPfmMiraiActions({ wallets, movements, categories }).filter(a => ['pfm.movement.create', 'pfm.movement.update'].includes(a.key)), ...budgetActions],
    revision: async (definition, prepared, a) => !prepared.targetId ? null : definition.key.includes('budget') ? (await budgets.listBudgets(ctx(a))).data.find(b => b.id === prepared.targetId) : movements.getOwnedMovement({ companyId: a.companyId, movementId: prepared.targetId }),
    effects: ['Movimientos internos y saldos de carteras autorizadas o presupuestos propios. Sin transferencias bancarias ni proveedores externos.'],
  };
}
