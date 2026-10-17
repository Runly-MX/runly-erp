import { z } from 'zod';
import { companyInput, operationRequest, resultSchema, proposalSchema } from './contracts.js';
import { createHrAdapter } from './adapters/hr.js';
import { createFleetAdapter } from './adapters/fleet.js';
import { createNotesAdapter } from './adapters/notes.js';
import { createPfmAdapter } from './adapters/pfm.js';
import { createLedgerAdapter } from './adapters/ledger.js';
import { createProjectsAdapter } from './adapters/projects.js';
import { createCalendarAdapter } from './adapters/calendar.js';
import { insist } from './config.js';
import { inventoryDescriptors, toolOutputFor } from './adapters/inventory.js';
import { createContactsAdapter } from './adapters/contacts.js';
import { createPurchasesAdapter } from './adapters/purchases.js';
import { createCanvasAdapter } from './adapters/canvas.js';
import { createAttendanceAdapter } from './adapters/attendance.js';
import { createFilesAdapter, createDocumentsAdapter, createIdentityAdapter, createActivityAdapter, createChatAdapter } from './adapters/readonly.js';
import { fileImportTools } from './file-import.js';

const factories = new Map(Object.entries({ hr: createHrAdapter, fleet: createFleetAdapter, notes: createNotesAdapter, pfm: createPfmAdapter, ledger: createLedgerAdapter, projects: createProjectsAdapter, calendar: createCalendarAdapter,
  contacts: createContactsAdapter, purchases: createPurchasesAdapter, canvas: createCanvasAdapter, attendance: createAttendanceAdapter, files: createFilesAdapter, documents: createDocumentsAdapter, identity: createIdentityAdapter, activity: createActivityAdapter, chat: createChatAdapter,
}).map(([domain, factory]) => [`runly.${domain}`, factory]));
export const MCP_DOMAINS = [...factories.keys()].map(key => key.slice(6));

export function createCapabilityRegistry({ prisma }) {
  function create(moduleKey, db = prisma) {
    const factory = factories.get(moduleKey);
    insist(factory, 'not_found', 'Módulo no disponible.', 404);
    const adapter = factory({ prisma: db });
    // Every write-capable domain must decide explicitly whether its proposals
    // need the extra sensitive confirmation; a missing declaration is a bug.
    insist(!adapter.actions.length || typeof adapter.sensitive === 'boolean' || typeof adapter.sensitive === 'function', 'invalid_adapter', `${moduleKey} debe declarar sensitive.`, 500);
    adapter.actions =adapter.actions.map(action => ({ ...action, readPermission: moduleKey === 'runly.canvas' ? 'canvas.view' : action.key.startsWith('pfm.budget.') ? 'pfm.wallets.read' : action.permission.replace(/\.(create|update)$/, '.read') }));
    return adapter;
  }
  const adapters = [...factories.keys()].map(key => create(key));
  const legacy = [
    ['runly_whoami', 'Identidad de la conexión', {}, 'runly:read'],
    ['runly_companies_list', 'Empresas autorizadas', {}, 'runly:read'],
    ['runly_modules_list', 'Capacidades ejecutables de los módulos autorizados', companyInput, 'runly:read'],
    ['runly_module_schema', 'Contrato de capacidades de un módulo', { ...companyInput, moduleKey: z.string().min(1).max(120) }, 'runly:read'],
    ...inventoryDescriptors(),
  ].map(([name, description, shape, scope]) => ({ name, description, scope, moduleKey: name.startsWith('runly_inventory_') ? 'runly.inventory' : null,
    inputSchema: z.object(shape).strict(), outputSchema: toolOutputFor(name),
    permission: name.startsWith('runly_inventory_') ? name.includes('_create_') ? 'inventory.item.create' : name.includes('_update_') ? 'inventory.item.update' : 'inventory.item.read' : null,
    operations: [], approvalPolicy: name.endsWith('_prepare') || name.endsWith('_commit') ? 'web-session-explicit' : 'none',
    annotations: { readOnlyHint: !name.endsWith('_commit') && !name.endsWith('_prepare'), destructiveHint: name.includes('_update_commit'), idempotentHint: !name.endsWith('_prepare'), openWorldHint: false },
  }));
  const tools = [...legacy, ...fileImportTools, ...adapters.flatMap(adapter => {
    const domain = adapter.moduleKey.slice(6);
    return (adapter.actions.length ? ['query', 'prepare', 'commit'] : ['query']).map(mode => ({
      name: `runly_${domain}_${mode}`, moduleKey: adapter.moduleKey, mode, domain,
      description: `${adapter.label}: ${mode === 'query' ? 'consultar recursos accesibles; selecciona una operación de request' : mode === 'prepare' ? 'preparar cambios; revisar y aprobar approvalUrl en Runly antes del commit' : 'ejecutar una propuesta aprobada; reintentos devuelven el resultado guardado'}.`,
      scope: `${domain}:${mode === 'query' ? 'read' : 'write'}`,
      inputSchema: z.object({ ...companyInput, ...(mode === 'commit' ? { proposalId: z.string().regex(/^[A-Za-z0-9_-]{43}$/) } : { request: operationRequest(mode === 'query' ? adapter.queries : adapter.actions) }) }).strict(),
      outputSchema: mode === 'prepare' ? proposalSchema : resultSchema,
      operations: mode === 'query' ? adapter.queries : adapter.actions,
      annotations: { readOnlyHint: mode === 'query', destructiveHint: mode === 'commit', idempotentHint: mode !== 'prepare', openWorldHint: false },
      approvalPolicy: mode === 'query' ? 'none' : 'web-session-explicit',
    }));
  })];
  return { create, tools, moduleKeys: [...factories.keys()] };
}
