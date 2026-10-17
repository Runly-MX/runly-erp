import { z } from 'zod';
import { createInventoryService } from '../../services/inventory-service.js';
import { createInventoryMiraiQueries } from '../../services/capabilities/inventory-queries.js';
import { createInventoryMiraiActions } from '../../services/capabilities/inventory-actions.js';
import { inventoryActionPlanSchema } from '../../services/inventory-chat-actions.js';
import { inventoryFiltersSchema } from '../../services/inventory-query.js';
import { accessFor, liveGrant } from '../access.js';
import { createMcpState, nonce, wire, transactionClient, digest } from '../state.js';
import { insist } from '../config.js';

export const companyInput = { companyId: z.uuid() };
const filters = inventoryFiltersSchema.omit({ missingSerial: true }).extend({ unassigned: z.boolean().optional() }).strict();
const text = z.string().trim().min(1).max(255);
export const updateInput = z.object({ itemId: z.uuid(), name: text.optional(), status: z.enum(['available', 'maintenance']).optional(),
  location: text.max(120).nullable().optional(), serialNumber: text.nullable().optional(), assetTag: text.max(100).nullable().optional(), notes: z.string().max(2000).nullable().optional(),
  model: text.optional(), purchaseDate: z.iso.date().nullable().optional(), warrantyExpiry: z.iso.date().nullable().optional() }).strict();
const entityContract = z.object({ key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(80), permission: text,
  fields: z.record(z.string().max(80), z.object({ type: z.enum(['string', 'number', 'integer', 'boolean']), description: z.string().max(500).optional(), nullable: z.boolean().optional() }).strict()) }).strict();
export const rme3McpContract = z.object({ version: z.literal(1), entities: z.array(entityContract).max(30) }).strict();
const jsonObject = z.record(z.string(), z.unknown());
const itemOutput = z.object({ id: z.uuid(), name: z.string().nullable(), assetTag: z.string().nullable(), folio: z.string().nullable(), serialNumber: z.string().nullable(),
  model: z.string().nullable(), status: z.string().nullable(), brandName: z.string().nullable(), categoryName: z.string().nullable(), locationName: z.string().nullable(), assignedToName: z.string().nullable(), link: z.string() });
const previewOutput = z.object({ title: z.string(), fields: z.array(z.object({ label: z.string(), value: z.string(), before: z.string().optional() })) });
const proposalOutput = z.object({ proposalId: z.string(), status: z.literal('approval_required'), preview: previewOutput, proposed: jsonObject, expiresIn: z.number(), approvalUrl: z.string().url() });
export function toolOutputFor(name) {
  const schemas = {
    runly_whoami: z.object({ id: z.uuid(), name: z.string(), clientId: z.string(), scopes: z.array(z.string()), resource: z.string().url() }),
    runly_companies_list: z.object({ companies: z.array(z.object({ id: z.uuid(), name: z.string() })) }),
    runly_modules_list: z.object({ modules: z.array(jsonObject) }),
    runly_module_schema: z.object({ moduleKey: z.string(), name: z.string(), operations: z.array(jsonObject), discoveryOnly: z.boolean().optional(), entities: z.array(jsonObject).optional() }),
    runly_inventory_search: z.object({ items: z.array(itemOutput), total: z.number().int(), page: z.number().int(), limit: z.number().int() }),
    runly_inventory_get: z.object({ item: itemOutput.extend({ description: z.string().nullable(), notes: z.string().nullable(), purchaseDate: z.string().nullable(), warrantyExpiry: z.string().nullable(), conditionName: z.string().nullable(), customValues: z.array(jsonObject).nullable() }) }),
    runly_inventory_catalogs: z.object({ brands: z.array(jsonObject), categories: z.array(jsonObject), locations: z.array(jsonObject), conditions: z.array(jsonObject), statuses: z.array(z.string()), fields: z.array(jsonObject), models: z.array(jsonObject), limitPerCatalog: z.number().int() }),
    runly_inventory_summary: z.object({ total: z.number().int(), missingSerial: z.number().int(), withSerial: z.number().int(), groupsLimit: z.number().int(), groups: z.array(jsonObject) }),
    runly_inventory_create_prepare: proposalOutput,
    runly_inventory_update_prepare: proposalOutput,
    runly_inventory_create_commit: z.object({ summary: z.string(), link: z.string(), results: z.array(z.object({ kind: z.string(), id: z.uuid(), name: z.string(), reused: z.boolean(), assetTag: z.string().optional() })) }),
    runly_inventory_update_commit: z.object({ id: z.uuid(), summary: z.string(), link: z.string() }),
  };
  return z.object({ data: schemas[name] });
}

// This registry is an adapter over the same deterministic capabilities MirAI
// uses. It never invokes an AI provider. RME3 discovery is explicitly opt-in;
// metadata never grants SQL access or creates universal CRUD tools.
export function inventoryDescriptors() {
  return [
    ['runly_inventory_search', 'Buscar equipos', { ...companyInput, filters: filters.default({}), page: z.number().int().min(1).max(10000).default(1), limit: z.number().int().min(1).max(50).default(30) }, 'inventory:read'],
    ['runly_inventory_get', 'Consultar equipo', { ...companyInput, itemId: z.uuid() }, 'inventory:read'],
    ['runly_inventory_catalogs', 'Consultar catálogos', { ...companyInput, search: z.string().max(200).default('') }, 'inventory:read'],
    ['runly_inventory_summary', 'Resumen de inventario', { ...companyInput, filters: inventoryFiltersSchema.default({}) }, 'inventory:read'],
    ['runly_inventory_create_prepare', 'Preparar alta; abrir approvalUrl para aprobar en Runly', { ...companyInput, plan: inventoryActionPlanSchema }, 'inventory:write'],
    ['runly_inventory_update_prepare', 'Preparar edición; abrir approvalUrl para aprobar en Runly', { ...companyInput, changes: updateInput }, 'inventory:write'],
    ...['create', 'update'].map(action => [`runly_inventory_${action}_commit`, 'Ejecutar propuesta aprobada por la persona en Runly; llámalo justo después de mostrar approvalUrl: espera la aprobación unos segundos; reintentos devuelven el mismo resultado', { ...companyInput, proposalId: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }, 'inventory:write']),
  ];
}

function snapshot(item) {
  return digest(JSON.stringify(wire(Object.fromEntries(['id', 'name', 'status', 'locationId', 'serialNumber', 'assetTag', 'notes', 'model', 'purchaseDate', 'warrantyExpiry', 'updatedAt'].map(key => [key, item[key] ?? null])))));
}
function compactItem(item, detail = false) {
  const keys = ['id', 'name', 'assetTag', 'folio', 'serialNumber', 'model', 'status', 'brandName', 'categoryName', 'locationName', 'assignedToName'];
  if (detail) keys.push('description', 'notes', 'purchaseDate', 'warrantyExpiry', 'conditionName', 'customValues');
  return { ...Object.fromEntries(keys.map(k => [k, item[k] ?? null])), link: `/app/m/runly.inventory/inventory/${item.id}` };
}

export function createInventoryMcpCapabilities({ prisma, config, oauth }) {
  const store = createMcpState(prisma);
  async function context(auth, companyId, permission, db = prisma) {
    // Revalidate the persisted OAuth grant as well as live ERP authorization on
    // every call (including batch calls and commits in the same HTTP request).
    const grant = await liveGrant(auth, db, prisma);
    insist(grant && !grant.payload.revoked && grant.payload.resource === config.resource && grant.payload.authUserId === auth.authUserId, 'invalid_token', 'Conexión revocada.', 401);
    insist(grant.payload.companyIds.includes(companyId), 'company_not_granted', 'Empresa no autorizada para esta conexión.', 403);
    const scoped = accessFor(auth, db, prisma), actx = await scoped.company(auth.authUserId, companyId, permission);
    await scoped.module(actx, 'runly.inventory');
    insist(actx.can('inventory.item.read'), 'permission_denied', 'No tienes permiso de lectura de Inventario.', 403);
    return actx;
  }
  async function prepare(auth, companyId, action, args) {
    const actx = await context(auth, companyId, action === 'create' ? 'inventory.item.create' : 'inventory.item.update');
    const inventory = createInventoryService({ prisma });
    const definition = createInventoryMiraiActions({ prisma, inventoryService: inventory }).find(a => a.operation === action);
    const prepared = await definition.prepare(args, actx);
    insist(!prepared.error, 'invalid_proposal', prepared.error);
    // Resolve referenced catalogs before displaying an approval. Newly proposed
    // catalogs are part of the same atomic intake plan.
    if (action === 'create') {
      for (const a of args.actions.filter(a => a.kind === 'item')) {
        for (const [field, kind, model] of [['brandName', 'brand', 'invBrand'], ['categoryName', 'category', 'invCategory'], ['locationName', 'location', 'invLocation']]) {
          if (!a.data[field] || args.actions.some(c => c.kind === kind && c.data.name.toLowerCase() === a.data[field].toLowerCase())) continue;
          const rows = await prisma[model].findMany({ where: { companyId, enabled: true, name: { equals: a.data[field], mode: 'insensitive' } }, take: 2, select: { id: true } });
          insist(rows.length === 1, 'catalog_ambiguous', `El catálogo ${a.data[field]} no existe o es ambiguo.`);
        }
      }
    }
    const id = nonce();
    const before = action === 'update' ? snapshot(await inventory.getItem(args.itemId, companyId)) : null;
    // MirAI's intake hash uses JSON field order. Preserve its exact serialized
    // payload across jsonb storage, which otherwise reorders object keys.
    await store.put('proposal', id, { authUserId: auth.authUserId, grantId: auth.grantId, companyId, action, args, prepared, argsJson: JSON.stringify(args), preparedJson: JSON.stringify(prepared), before, approved: false }, 600);
    return { proposalId: id, status: 'approval_required', preview: prepared.preview, proposed: args, expiresIn: 600, approvalUrl: `${config.web}/app/mcp?proposal=${id}` };
  }
  async function proposalInfo(authUserId, id) {
    const row = await store.get('proposal', id);
    insist(row?.payload.authUserId === authUserId, 'not_found', 'Propuesta no disponible.', 404);
    const p = row.payload;
    await context(p, p.companyId, p.action === 'update' ? 'inventory.item.update' : 'inventory.item.create');
    return { proposalId: id, companyId: p.companyId, action: p.action, preview: p.prepared.preview, proposed: p.args, approved: p.approved, completed: Boolean(p.result), expiresAt: row.expiresAt };
  }
  async function approve(authUserId, id, approved) {
    await prisma.$transaction(async db => {
      const s = createMcpState(db), row = await s.lock('proposal', id), p = row.payload;
      insist(p.authUserId === authUserId && !p.result, 'permission_denied', 'Propuesta no disponible.', 403);
      await context(p, p.companyId, p.action === 'update' ? 'inventory.item.update' : 'inventory.item.create', db);
      await s.save(row, { ...p, approved, rejected: !approved });
    });
    return { approved };
  }
  async function commit(auth, companyId, action, id) {
    return prisma.$transaction(async tx => {
      const db = transactionClient(tx), s = createMcpState(db);
      // Lock the live grant first so revocation cannot race a confirmed write.
      await s.lock('grant', auth.grantId);
      const actx = await context(auth, companyId, action === 'update' ? 'inventory.item.update' : 'inventory.item.create', db);
      // Share the intake lock across MCP creates/updates and MirAI intake,
      // including writes through different OAuth connections.
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`inventory-intake:${companyId}`}, 0))::text AS locked`;
      const row = await s.lock('proposal', id), p = row.payload;
      insist(p.authUserId === auth.authUserId && p.companyId === companyId && p.action === action && p.grantId === auth.grantId, 'proposal_mismatch', 'La propuesta pertenece a otro contexto.', 403);
      if (p.result) return p.result;
      insist(p.approved && !p.rejected, 'approval_required', 'Abre el enlace en Runly y aprueba la propuesta antes de ejecutarla.', 403);
      const args = JSON.parse(p.argsJson), prepared = JSON.parse(p.preparedJson);
      const inventory = createInventoryService({ prisma: db, activityBridge: { logAndPublish: async () => {} } });
      if (action === 'update') {
        await db.$queryRaw`SELECT id FROM inv_item WHERE id = ${args.itemId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
        insist(snapshot(await inventory.getItem(args.itemId, companyId)) === p.before, 'proposal_stale', 'El equipo cambió. Prepara y aprueba una propuesta nueva.', 409);
      }
      const definition = createInventoryMiraiActions({ prisma: db, inventoryService: inventory }).find(a => a.operation === action);
      const fresh = await definition.prepare(args, actx);
      insist(!fresh.error && JSON.stringify(wire(fresh)) === JSON.stringify(prepared), 'proposal_stale', 'La propuesta cambió. Prepárala de nuevo.', 409);
      const result = wire(await definition.execute(prepared.input, actx));
      await db.auditLog.create({ data: { companyId, actorId: actx.actorProfileId, moduleKey: 'runly.inventory', action: `inventory.mcp.${action}`, metadata: { proposalHash: digest(id), clientId: auth.clientId }, after: result } });
      await s.save(row, { ...p, result });
      return result;
    }, { timeout: 30000 });
  }
  async function run(name, args, auth) {
    const access = accessFor(auth, prisma, prisma);
    if (name === 'runly_whoami') {
      const { profile } = await access.identity(auth.authUserId);
      return { id: profile.id, name: profile.displayName, clientId: auth.clientId, scopes: auth.scopes, resource: config.resource };
    }
    if (name === 'runly_companies_list') {
      const { memberships } = await access.identity(auth.authUserId);
      return { companies: [...new Map(memberships.filter(m => auth.companyIds.includes(m.companyId)).map(m => [m.companyId, { id: m.companyId, name: m.company.name }])).values()] };
    }
    if (['runly_modules_list', 'runly_module_schema'].includes(name)) {
      insist(auth.companyIds.includes(args.companyId), 'company_not_granted', 'Empresa no autorizada.', 403);
      const actx = await access.company(auth.authUserId, args.companyId);
      const rows = await access.modules(actx);
      function exposed(row) {
        if (['runly.inventory', 'atlas.inventory'].includes(row.key)) return { moduleKey: row.key, name: row.name, operations: inventoryDescriptors().filter(d => auth.scopes.includes(d[3]) && actx.can('inventory.item.read') && actx.can(d[0].includes('_create_') ? 'inventory.item.create' : d[0].includes('_update_') ? 'inventory.item.update' : 'inventory.item.read')).map(d => ({ name: d[0], inputSchema: z.toJSONSchema(z.object(d[2]).strict(), { io: 'input' }) })) };
        const parsed = rme3McpContract.safeParse(row.manifest?.mcp);
        if (!parsed.success) return null;
        return { moduleKey: row.key, name: row.name, discoveryOnly: true, entities: parsed.data.entities.filter(e => actx.can(e.permission)), operations: [] };
      }
      const modules = rows.map(exposed).filter(Boolean);
      if (name === 'runly_modules_list') return { modules };
      const schema = modules.find(m => m.moduleKey === args.moduleKey);
      insist(schema, 'not_found', 'Módulo no expuesto a MCP.', 404);
      return schema;
    }
    if (name.endsWith('_prepare')) return prepare(auth, args.companyId, name.includes('_create_') ? 'create' : 'update', args.plan ?? args.changes);
    if (name.endsWith('_commit')) return commit(auth, args.companyId, name.includes('_create_') ? 'create' : 'update', args.proposalId);
    const actx = await context(auth, args.companyId, 'inventory.item.read');
    const inventory = createInventoryService({ prisma });
    if (name === 'runly_inventory_get') return { item: compactItem(await inventory.getItem(args.itemId, args.companyId), true) };
    if (name === 'runly_inventory_search') {
      const result = await inventory.listItems({ ...args.filters, companyId: args.companyId, page: args.page, limit: args.limit });
      return { items: result.data.map(i => compactItem(i)), total: result.total, page: args.page, limit: args.limit };
    }
    const tool = createInventoryMiraiQueries({ prisma }).find(t => `runly_${t.name}` === name);
    insist(tool, 'not_found', 'Herramienta no disponible.', 404);
    const result = await tool.run(name.endsWith('summary') ? { filters: args.filters, scope: 'company' } : { search: args.search }, actx);
    insist(!result.error, 'invalid_request', result.error);
    return result;
  }
  return { run, approve, proposalInfo };
}
