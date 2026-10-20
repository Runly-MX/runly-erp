import { z } from 'zod';
import { createInventoryService } from '../services/inventory-service.js';
import { createInventoryScope, canWriteArea } from '../services/inventory-scope.js';
import { createHrService } from '../services/hr-service.js';
import { createContactsService } from '../services/contacts-service.js';
import { createFleetService } from '../routes/fleet/fleet-service.js';
import { createDriverService } from '../routes/fleet/driver-service.js';
import { createReportsService } from '../routes/fleet/reports-service.js';
import { createDocumentAssociationSchema } from '../routes/fleet/validators.js';
import { createPurchasesServices } from '../routes/purchases/index.js';
import { hasCapability } from '../services/purchases-service.js';
import { createProjectsService } from '../routes/projects/projects-service.js';
import { createTasksService } from '../routes/projects/tasks-service.js';
import { createCanvasService } from '../routes/canvas/canvas-service.js';
import { createCatalogProductService } from '../routes/catalog/catalog-product-service.js';
import { createNotesService } from '../routes/notes/notes-service.js';
import { createWalletsService } from '../routes/pfm/wallets-service.js';
import { createMovementsService } from '../routes/pfm/movements-service.js';
import { createLedgerService } from '../routes/ledger/ledger-service.js';
import { createCalendarEventService } from '../routes/calendar/calendar-event-service.js';
import { createAttendanceService } from '../routes/attendance/attendance-service.js';
import { createChatService } from '../routes/chat/chat-service.js';
import { createUserAccessService } from '../services/user-access-service.js';
import { createFilesService } from '../services/files-service.js';
import { createFileAccess } from '../services/files/access.js';
import { createMcpAccess } from './access.js';
import { wire } from './state.js';
import { insist } from './config.js';

// Explicit destinations, not caller-selected tables/columns. Native entries
// match existing ERP attachment panels; references remain private Files assets.
// visibility PUBLIC stores images in the public bucket (permanent URLs) for the
// website and the storefront; every other destination stays private.
const native = (type, domain, entityType, readPermission, writePermission, path, visibility = 'PRIVATE') => ({ type, moduleKey: `runly.${domain}`, entityType, readPermission, writePermission, mode: 'native', path, visibility });
const reference = (type, domain, readPermission, path) => ({ type, moduleKey: `runly.${domain}`, readPermission, mode: 'private-reference', path });
export const ATTACHMENT_TARGETS = [
  native('inventory.item', 'inventory', 'InvItem', 'inventory.item.read', 'inventory.item.update', '/inventory'),
  native('hr.employee', 'hr', 'HrEmployee', 'hr.employee.read', 'hr.employee.update', '/hr/employees'),
  native('fleet.vehicle', 'fleet', 'FleetVehicle', 'fleet.vehicles.read', 'fleet.vehicles.update', '/fleet/vehicles'),
  native('fleet.driver', 'fleet', 'FleetDriver', 'fleet.drivers.read', 'fleet.drivers.update', '/fleet/drivers'),
  native('fleet.report', 'fleet', 'FleetReport', 'fleet.reports.read', 'fleet.reports.update', '/fleet/reports'),
  native('contacts.contact', 'contacts', 'Contact', 'contacts.contacts.read', 'contacts.contacts.update', '/contacts'),
  ...[['request', 'purchase_request', 'update'], ['quote', 'purchase_quote', 'manage'], ['order', 'purchase_order', 'update'], ['invoice', 'purchase_invoice', 'update'], ['receipt', 'purchase_receipt', 'create']].map(([kind, entity, write]) => native(`purchases.${kind}`, 'purchases', entity, `purchases.${kind}.read`, `purchases.${kind}.${write}`, `/purchases/${kind === 'quote' ? 'quotes' : `${kind}s`}`)),
  native('projects.task', 'projects', 'Task', 'projects.task.read', 'projects.task.update', ''),
  native('canvas.board', 'canvas', 'CanvasBoard', 'canvas.view', 'canvas.comment', '/boards'),
  native('canvas.hotspot', 'canvas', 'CanvasHotspot', 'canvas.view', 'canvas.comment', '/boards'),
  native('website.site', 'website', 'AtlasFile', 'website.site.read', 'website.pages.update', '', 'PUBLIC'),
  native('catalog.product', 'catalog', 'AtlasFile', 'catalog.products.read', 'catalog.products.update', '', 'PUBLIC'),
  reference('projects.project', 'projects', 'projects.project.read', ''),
  reference('notes.note', 'notes', 'notes.notes.read', ''),
  reference('pfm.wallet', 'pfm', 'pfm.wallets.read', ''),
  reference('pfm.movement', 'pfm', 'pfm.movements.read', ''),
  reference('ledger.account', 'ledger', 'ledger.accounts.read', ''),
  reference('ledger.transaction', 'ledger', 'ledger.transactions.read', ''),
  reference('calendar.event', 'calendar', 'calendar.events.read', ''),
  reference('attendance.person', 'attendance', 'attendance.view', ''),
  reference('identity.profile', 'identity', 'identity.users.read', ''),
  reference('activity.entry', 'activity', 'activity.read', ''),
  reference('chat.conversation', 'chat', 'chat.conversations.read', ''),
  reference('documents.file', 'documents', 'files.assets.read', ''),
  reference('files.file', 'files', 'files.assets.read', ''),
  reference('lms.course', 'lms', 'lms.course.manage', '/courses'),
];
export const attachmentTargetSchema = z.strictObject({ type: z.enum(ATTACHMENT_TARGETS.map(target => target.type)), id: z.uuid() });
export const normalizeAttachmentTarget = (target, itemId) => target ?? (itemId ? { type: 'inventory.item', id: itemId } : null);
const purchaseCapabilities = { 'purchases.request': 'requests', 'purchases.quote': 'quotes', 'purchases.order': 'purchaseOrders', 'purchases.invoice': 'invoices', 'purchases.receipt': 'receipts' };

export function createAttachmentTargets({ prisma }) {
  const inventory = createInventoryService({ prisma });
  const canvas = createCanvasService({ prisma });
  const projects = createProjectsService({ prisma });
  const wallets = createWalletsService({ prisma });
  async function project(a, id, write) {
    const row = await projects.getProject(id, a.actorProfileId);
    insist(row.companyId === a.companyId, 'not_found', 'Proyecto no disponible.', 404);
    const role = row.ownerId === a.actorProfileId ? 'OWNER' : row.members.find(member => member.userId === a.actorProfileId)?.role;
    insist(!write || ['OWNER', 'MEMBER'].includes(role), 'permission_denied', 'No puedes adjuntar archivos en este proyecto.', 403);
    return row;
  }
  async function purchase(a, type, id) {
    const services = createPurchasesServices({ prisma });
    const kinds = { request: ['requests', 'requests'], quote: ['quotes', 'quotes'], order: ['orders', 'purchaseOrders'], invoice: ['invoices', 'invoices'], receipt: ['receipts', 'receipts'] };
    const [kind, capability] = kinds[type];
    const workflow = await prisma.purchaseWorkflow.findFirst({ where: { companyId: a.companyId, isDefault: true, enabled: true }, select: { capabilities: true } });
    insist(workflow && hasCapability(workflow.capabilities, capability), 'capability_disabled', 'El flujo de Compras no tiene habilitado este tipo de documento.', 409);
    const row = type === 'request' ? await services.procurement.getRequest(a.companyId, id, a.can) : type === 'quote' ? await services.procurement.getQuote(a.companyId, id, a.can) : type === 'receipt' ? await services.receipts.get(a.companyId, id, a.can) : await services.documents.get(kind, a.companyId, id, a.can);
    return row;
  }
  async function resource(spec, a, write) {
    const { id, type } = spec, ctx = { companyId: a.companyId, actorId: a.actorProfileId };
    switch (type) {
      case 'inventory.item': {
        // Area scoping: out-of-scope items are 404; attaching needs editor on the item's area.
        const scope = await createInventoryScope({ prisma }).resolve({ companyId: a.companyId, userId: a.actorProfileId, userContext: a });
        const item = await inventory.getItem(id, a.companyId, scope);
        if (write && !canWriteArea(scope, item.areaId ?? null)) insist(false, 'permission_denied', 'No tienes permiso de edicion en el area de ese equipo.', 403);
        return item;
      }
      case 'hr.employee': return createHrService({ prisma }).getEmployee({ authUserId: a.actorAuthUserId, companyId: a.companyId, id });
      case 'contacts.contact': return createContactsService({ prisma }).getById({ companyId: a.companyId, id });
      case 'fleet.vehicle': return createFleetService({ prisma }).getVehicle({ companyId: a.companyId, id });
      case 'fleet.driver': return createDriverService({ prisma }).getDriver({ companyId: a.companyId, id });
      case 'fleet.report': return createReportsService({ prisma }).getReport({ companyId: a.companyId, id });
      case 'purchases.request': case 'purchases.quote': case 'purchases.order': case 'purchases.invoice': case 'purchases.receipt': return purchase(a, type.split('.')[1], id);
      case 'projects.project': return project(a, id, false);
      case 'projects.task': {
        const link = await prisma.task.findFirst({ where: { id, project: { companyId: a.companyId, OR: [{ ownerId: a.actorProfileId }, { members: { some: { userId: a.actorProfileId } } }] } }, select: { projectId: true } });
        insist(link, 'not_found', 'Tarea no disponible.', 404);
        await project(a, link.projectId, write);
        return createTasksService({ prisma }).getTask(id, { ...ctx, projectId: link.projectId });
      }
      case 'canvas.board': return (await canvas.assertBoardAccess(a.companyId, a.actorProfileId, id, write ? 'COMMENTER' : 'VIEWER')).board;
      case 'canvas.hotspot': {
        const hotspot = await prisma.canvasHotspot.findFirst({ where: { id, companyId: a.companyId, archivedAt: null }, select: { id: true, boardId: true, title: true, updatedAt: true } });
        insist(hotspot, 'not_found', 'Hotspot no disponible.', 404);
        await canvas.assertBoardAccess(a.companyId, a.actorProfileId, hotspot.boardId, write ? 'COMMENTER' : 'VIEWER');
        return hotspot;
      }
      case 'website.site': {
        const site = await prisma.websiteSite.findFirst({ where: { id, companyId: a.companyId, enabled: true }, select: { id: true, name: true, enabled: true, updatedAt: true } });
        insist(site, 'not_found', 'Sitio no disponible.', 404);
        return site;
      }
      case 'catalog.product': {
        const product = await createCatalogProductService({ prisma }).getProductById({ companyId: a.companyId, id });
        insist(product, 'not_found', 'Producto no disponible.', 404);
        return product;
      }
      case 'lms.course': {
        const course = await prisma.lmsCourse.findFirst({ where: { id, companyId: a.companyId, enabled: true }, select: { id: true, title: true, updatedAt: true } });
        insist(course, 'not_found', 'Curso no disponible.', 404);
        return course;
      }
      case 'notes.note': {
        const row = await createNotesService({ prisma }).getNote(id, a.actorProfileId);
        insist(row && (!row.company_id || row.company_id === a.companyId), 'not_found', 'Nota no disponible.', 404);
        return row;
      }
      case 'pfm.wallet': return wallets.getWallet({ ...ctx, walletId: id });
      case 'pfm.movement': {
        const row = await createMovementsService({ prisma, wallets }).getOwnedMovement({ companyId: a.companyId, movementId: id });
        await wallets.getWallet({ ...ctx, walletId: row.walletId });
        return row;
      }
      case 'ledger.account': return createLedgerService({ prisma }).getAccount({ ...ctx, accountId: id });
      case 'ledger.transaction': {
        const row = await prisma.ledgerTransaction.findFirst({ where: { id, companyId: a.companyId } });
        insist(row, 'not_found', 'Transacción no disponible.', 404);
        await createLedgerService({ prisma }).getAccount({ ...ctx, accountId: row.accountId });
        return row;
      }
      case 'calendar.event': return createCalendarEventService({ prisma }).getEvent(a.actorProfileId, id, a.companyId);
      case 'attendance.person': return createAttendanceService({ prisma }).getPerson(a.companyId, id);
      case 'identity.profile': {
        await createUserAccessService({ prisma }).assertCandidates({ companyId: a.companyId, userIds: [id] });
        return prisma.userProfile.findUnique({ where: { id }, select: { id: true, displayName: true, updatedAt: true } });
      }
      case 'activity.entry': return prisma.activity.findFirst({ where: { id, companyId: a.companyId, actorId: a.actorProfileId }, select: { id: true, summary: true, createdAt: true } });
      case 'chat.conversation': {
        const row = await createChatService({ prisma, includeAvatarUrls: false }).getConversation({ conversationId: id, authUserId: a.actorAuthUserId });
        insist(row.company_id === a.companyId && row.type !== 'external_support', 'not_found', 'Conversación no disponible.', 404);
        return row;
      }
      case 'documents.file': case 'files.file': {
        const file = await createFilesService({ prisma }).getById({ authUserId: a.actorAuthUserId, activeContext: { companyId: a.companyId, profileId: a.actorProfileId, isAdmin: a.isAdmin, permissionSet: a.permissionSet }, id });
        insist(type !== 'documents.file' || file.entityType === 'AtlasFile' && [null, 'runly.files', 'atlas.files'].includes(file.moduleKey), 'not_found', 'Documento no disponible.', 404);
        return file;
      }
      default: insist(false, 'unsupported_target', 'Destino de adjuntos no soportado.', 400);
    }
  }
  async function resolve(spec, a, { write = true, scopes = a.mcpScopes } = {}) {
    if (!spec) return null;
    spec = attachmentTargetSchema.parse(spec);
    const definition = ATTACHMENT_TARGETS.find(target => target.type === spec.type), nativeWrite = write && definition.mode === 'native';
    const scope = `${definition.moduleKey.slice(6)}:${nativeWrite ? 'write' : 'read'}`;
    insist(scopes?.includes(scope), 'insufficient_scope', `Se requiere consentimiento ${scope} para este destino.`, 403);
    insist(a.can(definition.readPermission) && (!nativeWrite || a.can(definition.writePermission)), 'permission_denied', 'No tienes permiso para usar adjuntos en este destino.', 403);
    await createMcpAccess(prisma).module(a, definition.moduleKey);
    let result;
    try { result = await resource(spec, a, nativeWrite); }
    catch (error) {
      if (error.status === 404) insist(false, 'not_found', 'Registro no disponible.', 404);
      if (error.status === 403) insist(false, 'permission_denied', 'No tienes acceso suficiente al registro.', 403);
      throw error;
    }
    const row = result?.data ?? result;
    insist(row && row.enabled !== false && !row.archivedAt, 'not_found', 'Registro no disponible.', 404);
    const name = row.name ?? row.title ?? row.displayName ?? row.full_name ?? row.number ?? row.plate ?? row.nombre ?? row.description ?? row.summary ?? ([row.firstName, row.lastName].filter(Boolean).join(' ') || definition.type);
    const snapshot = wire({ id: spec.id, name: String(name).slice(0, 250), updatedAt: row.updatedAt ?? row.updated_at ?? row.revision ?? row.createdAt ?? row.created_at ?? null, mode: definition.mode, projectId: row.projectId ?? null, boardId: row.boardId ?? null });
    let link = `/app/m/${definition.moduleKey}${definition.path}${definition.path ? `/${spec.id}` : ''}`;
    if (spec.type === 'canvas.hotspot') link = `/app/m/runly.canvas/boards/${snapshot.boardId}?hotspotId=${spec.id}`;
    if (spec.type === 'projects.task') link = `/app/m/runly.projects?open=task:${spec.id}&project=${snapshot.projectId}`;
    if (spec.type === 'projects.project') link = `/app/m/runly.projects?project=${spec.id}`;
    if (spec.type === 'catalog.product') link = `/app/m/runly.catalog/${spec.id}`;
    if (spec.type === 'notes.note') link = `/app/m/runly.notes?noteId=${spec.id}`;
    if (spec.type === 'calendar.event') link = `/app/m/runly.calendar?eventId=${spec.id}`;
    if (spec.type === 'ledger.account' || spec.type === 'ledger.transaction') link = `/app/m/runly.ledger/accounts/${spec.type === 'ledger.account' ? spec.id : row.accountId}`;
    if (spec.type === 'files.file' || spec.type === 'documents.file') link = `/app/m/runly.files?fileId=${spec.id}`;
    return { ...definition, spec, snapshot, link };
  }
  function fields(target) {
    if (!target) return { moduleKey: 'runly.files', entityType: 'AtlasFile', visibility: 'PRIVATE' };
    return target.mode === 'native' ? { moduleKey: target.moduleKey, entityType: target.entityType, entityId: target.spec.id, visibility: target.visibility ?? 'PRIVATE' } : { moduleKey: 'runly.files', entityType: 'AtlasFile', visibility: 'PRIVATE' };
  }
  async function link(target, asset, a) {
    if (!target || target.mode !== 'native') return;
    const id = target.spec.id, payload = createDocumentAssociationSchema.parse({ file_asset_id: asset.id, document_type: 'document', label: asset.originalName.slice(0, 200) });
    if (target.spec.type === 'inventory.item') await inventory.addItemFile(id, asset.id, a.companyId, asset.originalName);
    if (target.spec.type === 'fleet.vehicle') await createFleetService({ prisma }).addVehicleDocument({ companyId: a.companyId, actorId: a.actorProfileId, vehicleId: id, payload });
    if (target.spec.type === 'fleet.driver') await createDriverService({ prisma }).addDriverDocument({ companyId: a.companyId, actorId: a.actorProfileId, driverId: id, payload });
    if (target.spec.type === 'fleet.report') await createReportsService({ prisma }).addReportDocument({ companyId: a.companyId, actorId: a.actorProfileId, reportId: id, payload });
    if (target.spec.type === 'catalog.product') {
      // First image becomes the cover; the rest join the product gallery.
      const products = createCatalogProductService({ prisma }), product = await products.getProductById({ companyId: a.companyId, id });
      const images = Array.isArray(product.images) ? product.images : [];
      await products.updateProduct({ companyId: a.companyId, id, data: product.cover_asset_id ? { images: [...images, asset.id] } : { cover_asset_id: asset.id } });
    }
    if (target.spec.type.startsWith('canvas.')) {
      const boardId = target.spec.type === 'canvas.board' ? id : target.snapshot.boardId;
      await canvas.addAttachment(a.companyId, a.actorProfileId, boardId, { targetType: target.spec.type === 'canvas.board' ? 'BOARD' : 'HOTSPOT', targetId: id, fileAssetId: asset.id, label: asset.originalName });
    }
  }
  async function catalog(a) {
    const modules = await createMcpAccess(prisma).modules(a), enabled = new Set(modules.map(module => module.key.replace(/^atlas\./, 'runly.')));
    const workflow = enabled.has('runly.purchases') ? await prisma.purchaseWorkflow.findFirst({ where: { companyId: a.companyId, isDefault: true, enabled: true }, select: { capabilities: true } }) : null;
    return ATTACHMENT_TARGETS.filter(target => enabled.has(target.moduleKey) && a.can(target.readPermission) && a.mcpScopes?.includes(`${target.moduleKey.slice(6)}:read`) && (!purchaseCapabilities[target.type] || hasCapability(workflow?.capabilities, purchaseCapabilities[target.type]))).map(target => ({ type: target.type, moduleKey: target.moduleKey, mode: target.mode, readPermission: target.readPermission, writePermission: target.writePermission ?? null, canImport: a.can('files.assets.create') && a.can('files.assets.read') && a.mcpScopes.includes('files:write') && (target.mode !== 'native' || a.can(target.writePermission) && a.mcpScopes.includes(`${target.moduleKey.slice(6)}:write`)) }));
  }
  async function list(spec, a, { page = 1, limit = 30 } = {}) {
    const target = await resolve(spec, a, { write: false });
    const access = createFileAccess({ prisma }).readWhere({ profileId: a.actorProfileId, admin: false });
    const where = { entityId: a.companyId, enabled: true, ...(target.mode === 'native' ? { moduleKey: target.moduleKey, entityType: target.entityType, metadata: { path: ['sourceEntityId'], equals: spec.id }, AND: [access] } : { moduleKey: 'runly.files', entityType: 'AtlasFile', AND: [{ metadata: { path: ['mcpTarget', 'type'], equals: spec.type } }, { metadata: { path: ['mcpTarget', 'id'], equals: spec.id } }, access] }) };
    const rows = await prisma.fileAsset.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit });
    return { mode: target.mode, target: spec, items: rows.map(file => ({ id: file.id, name: file.originalName, mimeType: file.mimeType, sizeBytes: Number(file.sizeBytes), link: `/app/m/runly.files?fileId=${file.id}` })), page, limit, hasMore: rows.length === limit };
  }
  return { resolve, fields, link, catalog, list };
}
