import { createPurchasesMiraiCapabilities } from '../../routes/purchases/mirai-capabilities.js';
import { hasCapability } from '../../services/purchases-service.js';
import { insist } from '../config.js';

export function createPurchasesAdapter({ prisma }) {
  const capability = createPurchasesMiraiCapabilities({ prisma });
  const workflow = companyId => prisma.purchaseWorkflow.findFirst({ where: { companyId, enabled: true, isDefault: true }, orderBy: { createdAt: 'asc' } });
  async function availableOperations(a) {
    const current = await workflow(a.companyId), keys = new Set(['purchases_pending']);
    if (!current) return keys;
    keys.add('purchases_search_documents');
    if (hasCapability(current.capabilities, ['invoices', 'purchaseOrders'])) keys.add('purchases_spend_summary');
    if (hasCapability(current.capabilities, 'requests')) keys.add('purchases.request.create');
    if (hasCapability(current.capabilities, 'approvals')) { keys.add('purchases_list_approvals'); keys.add('purchases.approval.decide'); }
    return keys;
  }
  return { moduleKey: capability.moduleKey, label: capability.label, queries: capability.tools.filter(tool => !tool.name.includes('_public_')),
    // Keep procurement workflow transitions explicit. No automatic payment,
    // inventory receipt, invoice mutation, or external supplier communication.
    actions: capability.actions.filter(action => ['purchases.request.create', 'purchases.approval.decide'].includes(action.key)),
    availableOperations,
    async guard(definition, _input, a) { insist((await availableOperations(a)).has(definition.key ?? definition.name), 'capability_disabled', 'Configura y habilita esta operación en el flujo de Compras.', 409); },
    revision: async (_definition, prepared, a) => ({ workflow: await workflow(a.companyId), resource: prepared.targetId ? await prisma.purchaseApproval.findFirst({ where: { id: prepared.targetId, companyId: a.companyId } }) : null }),
    effects: ['Crear solicitud en borrador o decidir una aprobación pendiente con el permiso ERP específico. Sin pagos ni recepción automática de inventario.'],
  };
}
