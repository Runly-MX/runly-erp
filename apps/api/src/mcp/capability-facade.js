import { z } from 'zod';
import { createInventoryMcpCapabilities, rme3McpContract } from './adapters/inventory.js';
import { createCapabilityRegistry } from './registry.js';
import { createDomainRuntime } from './domain-runtime.js';
import { createMcpAccess } from './access.js';
import { createMcpState } from './state.js';
import { insist } from './config.js';
import { parameterSchema } from './contracts.js';

export function createMcpCapabilities({ prisma, config, oauth }) {
  const inventory = createInventoryMcpCapabilities({ prisma, config, oauth });
  const registry = createCapabilityRegistry({ prisma });
  const runtime = createDomainRuntime({ prisma, config, registry });
  async function discovery(name, args, auth) {
    insist(auth.companyIds.includes(args.companyId), 'company_not_granted', 'Empresa no autorizada.', 403);
    const access = createMcpAccess(prisma), actx = await access.company(auth.authUserId, args.companyId);
    const rows = await access.modules(actx), modules = [];
    for (const row of rows) {
      if (['runly.inventory', 'atlas.inventory'].includes(row.key)) {
        modules.push(await inventory.run('runly_module_schema', { ...args, moduleKey: row.key }, auth));
        continue;
      }
      const canonicalKey = row.key.replace(/^atlas\./, 'runly.');
      const tools = registry.tools.filter(tool => tool.moduleKey === canonicalKey && auth.scopes.includes(tool.scope));
      if (registry.moduleKeys.includes(canonicalKey)) {
        const operations = tools.flatMap(tool => tool.operations.filter(operation => actx.can(operation.permission)).map(operation => ({
          name: tool.name, operation: operation.name ?? operation.key, description: operation.definition?.description ?? operation.description ?? operation.label,
          scope: tool.scope, permission: operation.permission, approvalPolicy: tool.approvalPolicy, mode: tool.mode,
          inputSchema: z.toJSONSchema(tool.mode === 'commit' ? tool.inputSchema : operation.inputSchema ?? parameterSchema(operation.definition?.parameters ?? operation.parameters), { io: 'input' }),
        })));
        if (operations.length) modules.push({ moduleKey: row.key, name: row.name, operations });
        continue;
      }
      const parsed = rme3McpContract.safeParse(row.manifest?.mcp);
      if (parsed.success) modules.push({ moduleKey: row.key, name: row.name, discoveryOnly: true, entities: parsed.data.entities.filter(entity => actx.can(entity.permission)), operations: [] });
    }
    if (name === 'runly_modules_list') return { modules: modules.map(module => ({ ...module, operations: module.operations.map(({ inputSchema, ...operation }) => operation) })) };
    const result = modules.find(module => module.moduleKey === args.moduleKey);
    insist(result, 'not_found', 'Módulo no expuesto a MCP.', 404);
    return result;
  }
  async function run(name, args, auth) {
    const tool = registry.tools.find(tool => tool.name === name);
    if (tool?.domain) return runtime.run(tool.domain, tool.mode, args, auth);
    if (name === 'runly_modules_list' || name === 'runly_module_schema') return discovery(name, args, auth);
    return inventory.run(name, args, auth);
  }
  async function handler(method, authUserId, id, ...args) {
    const row = await createMcpState(prisma).get('proposal', id);
    return (row?.payload.version === 2 ? runtime : inventory)[method](authUserId, id, ...args);
  }
  return { run, tools: registry.tools, proposalInfo: (user, id) => handler('proposalInfo', user, id), approve: (user, id, approved, acknowledgeSensitive) => handler('approve', user, id, approved, acknowledgeSensitive) };
}
