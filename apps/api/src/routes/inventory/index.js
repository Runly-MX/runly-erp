// apps/api/src/routes/inventory/index.js
//
// runly.inventory HTTP routes. Extracted verbatim from apps/api/src/index.js
// (2026-08-30) so the entry point stays under the file-size limit. Auth is
// applied by mountWithAuth(); every route still declares its own
// requirePermission(...).
import { Hono } from "hono";
import { createInventoryIntakeRouter } from './intake-routes.js';
import { tenantActiveContext } from '../../lib/active-context.js';
import { createInventoryModelsRouter } from './models-routes.js';
import { createInventoryImportRouter } from './import-routes.js';
import { createInventoryExportRouter } from './export-routes.js';
import { createInventoryAdminRouter } from './admin-routes.js';
import { createInventoryCustodyRouter } from './custody-routes.js';
import { createInventoryLabelRouter } from './label-routes.js';
import { createInventoryScanRouter } from './scan-routes.js';
import { createInventoryLabelService, appBaseUrlFromEnv } from '../../services/inventory-label-service.js';
import { createInventoryPublicService } from '../../services/inventory-public-service.js';
import { createInventoryModelService } from '../../services/inventory-model-service.js';
import { createCoreTargetConnections } from '../../services/connections/core-target-connections.js';
import { attachUserAvatarUrls } from '../../lib/attach-user-avatars.js';
import { findActiveDuplicates } from '../../services/inventory-identifiers.js';
import { listInventoryMedia } from '../../services/inventory-media.js';
import { createInventorySearch } from '../../services/inventory-search-service.js';
import { preparePurchaseLinks, withoutPurchaseLinkFields, composeAfterWrite, loadPurchaseLinks, loadPurchaseNumbersForItems, purchaseLinkFields } from '../../services/inventory-purchase-links.js';
import { publishActivityFromContext, getActivityContext } from '../../services/activity-publisher.js';
import { createInventoryScope } from '../../services/inventory-scope.js';
import { createScopeGuards } from './scope-guard.js';
import { createInventoryAreaRouter } from './area-routes.js';
import { createInventoryAreaService } from '../../services/inventory-area-service.js';
import { createInventoryGuestInviteRouter } from './guest-invite-routes.js';
import { createInventoryGuestService } from '../../services/inventory-guest-service.js';
import { createInventoryProposalRouter } from './proposal-routes.js';
import { createInventoryProposalService } from '../../services/inventory-proposal-service.js';

export function createInventoryRouter({
  prisma,
  requirePermission: baseRequirePermission,
  inventoryService,
  InventoryServiceError,
  inventoryNotifSvc,
  commentsService,
  CommentsServiceError,
  enrichFilesWithSignedUrls,
  filesService,
  supabaseAdmin = null,
  // Documents hub (custody documents are filled by hub.engine); defaults to a private one.
  documentsHub = null,
  // Area scoping (see services/inventory-scope.js). Injectable for tests; the default is the real one.
  inventoryScope = createInventoryScope({ prisma }),
  inventoryAreaService = createInventoryAreaService({ prisma }),
  // Supplier guests (invitations). The app injects the instance with mail wired; tests/defaults have none.
  guestService = createInventoryGuestService({ prisma }),
}) {
  const router = new Hono();
  const guards = createScopeGuards({ prisma, inventoryScope });
  // Every route below (and the sub-routers) goes through this: permission first, then the
  // per-item area guard for /inventory/items/:id[/...] (404 when the item is out of scope).
  const requirePermission = guards.withScopeGuard(baseRequirePermission);
  const scopeOf = (c) => inventoryScope.fromContext(c);
  const itemConnections = createCoreTargetConnections({ prisma, targetType: "inventory_item" });
  router.route('/', createInventoryAreaRouter({ prisma, requirePermission, inventoryScope, inventoryAreaService, InventoryServiceError, supabaseAdmin }));
  router.route('/', createInventoryGuestInviteRouter({ requirePermission, inventoryScope, guestService, InventoryServiceError }));
  router.route('/', createInventoryProposalRouter({ requirePermission, inventoryScope, proposalService: createInventoryProposalService({ prisma, inventoryService }), InventoryServiceError }));
  router.route('/', createInventoryIntakeRouter({ prisma, requirePermission, inventoryScope }));
  router.route('/', createInventoryModelsRouter({ prisma, requirePermission, inventoryService, InventoryServiceError }));
  router.route('/', createInventoryAdminRouter({ prisma, requirePermission, InventoryServiceError, inventoryNotifSvc, supabaseAdmin, inventoryScope }));
  router.route('/', createInventoryExportRouter({ prisma, requirePermission, InventoryServiceError, supabaseAdmin, inventoryScope }));
  router.route('/', createInventoryImportRouter({ prisma, requirePermission, InventoryServiceError, inventoryService, filesService, inventoryScope }));
  router.route('/', createInventoryCustodyRouter({ prisma, requirePermission, InventoryServiceError, supabaseAdmin, inventoryScope, documentsHub }));
  const publicService = createInventoryPublicService({ prisma, supabaseAdmin });
  const labelService = createInventoryLabelService({ prisma, publicBaseUrl: appBaseUrlFromEnv(), publicService });
  router.route('/', createInventoryLabelRouter({ requirePermission, InventoryServiceError, labelService, publicService, publicBaseUrl: appBaseUrlFromEnv(), prisma, inventoryScope }));
  router.route('/', createInventoryScanRouter({ prisma, requirePermission, InventoryServiceError, publicService, inventoryScope }));
  const modelDefaults = createInventoryModelService({ prisma });

  const isInvErr = (err) => err instanceof InventoryServiceError;
  // `code` + `details` (e.g. SERIAL_EXISTS with the existing item) reach the client when present.
  const invErrorBody = (err) => ({ error: err.message, ...(err.code ? { code: err.code, details: err.details ?? null } : {}) });

  // Audit-trail entries for files on an item (comments publish from comments-service) (spec
  // 2026-10-03-audit-trail-design §2.5). Best effort: never fails the write.
  const itemActivity = (c, itemId, type, verb, detail = null) => {
    const { actorName } = getActivityContext(c);
    const text = detail ? `${actorName} ${verb}: ${detail}` : `${actorName} ${verb}`;
    return publishActivityFromContext(prisma, c, {
      type: `inventory.item.${type}`,
      severity: "info",
      entityType: "InvItem",
      entityId: itemId,
      summary: text.length > 480 ? `${text.slice(0, 480)}…` : text,
      link: `/app/m/runly.inventory/inventory/${itemId}`,
    });
  };
  const fileName = async (fileAssetId) =>
    (await prisma.fileAsset.findUnique({ where: { id: fileAssetId }, select: { originalName: true } }).catch(() => null))?.originalName ?? null;
  const isCommentErr = (err) => err instanceof CommentsServiceError || err?.status === 404;


  const hasPerm = (c, key) => {
    const ctx = c.get("userContext");
    return Boolean(ctx?.isAdmin || ctx?.permissionSet?.has?.(key));
  };
  // Body + afterWrite for an item write: connections plus the purchase order /
  // invoice links (purchaseOrderId / purchaseInvoiceId), all in one transaction.
  async function prepareItemWrite(c, itemId = null) {
    const raw = await c.req.json();
    const links = await preparePurchaseLinks({
      prisma, companyId: c.get("companyId"), actorId: c.get("userContext")?.profile?.id ?? null, itemId, body: raw,
      canManage: hasPerm(c, "purchases.relation.manage"), fail: (message, status) => new InventoryServiceError(message, status),
    });
    const { data, afterWrite } = await itemConnections.prepare(c, withoutPurchaseLinkFields(raw), itemId ?? undefined);
    return { body: data, afterWrite: composeAfterWrite(afterWrite, links.afterWrite) };
  }

  // ── Items ────────────────────────────────────────────────────────────────
  // Live duplicate check for the forms: which ACTIVE item already uses this serial / asset number.
  router.get("/inventory/items/check-identifiers", requirePermission("inventory.item.read"), async (c) => {
    try {
      const { assetTag, serialNumber, excludeId } = c.req.query();
      const data = await findActiveDuplicates(prisma, c.get("companyId"), { assetTag, serialNumber, excludeId: excludeId || null, scope: await scopeOf(c) });
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "No se pudo comprobar el número." }, 500);
    }
  });
  router.get("/inventory/items", requirePermission("inventory.item.read"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { search, categoryId, brandId, locationId, conditionId, adminStatus, status, assignedToId, modelId, model, folio, assetTag, serialNumber, partNumber, createdFrom, createdTo, purchaseFrom, purchaseTo, labeled, areaId, customField, mine, page, limit, pageSize, sortBy, sortDir } = c.req.query();
      const connectionMatchIds = await itemConnections.searchIds(c, search);
      const result = await inventoryService.listItems({ companyId, search, connectionMatchIds, categoryId, brandId, locationId, conditionId, adminStatus, status, assignedToId, modelId, model, folio, assetTag, serialNumber, partNumber, createdFrom, createdTo, purchaseFrom, purchaseTo, labeled, areaId, customField, sortBy, sortDir, page: Number(page) || 1, limit: Number(pageSize ?? limit) || 50, scope: await scopeOf(c), mine: mine === "true" ? await inventoryScope.mineFromContext(c) : null });
      if (hasPerm(c, "inventory.label.read")) {
        const stats = await labelService.statsForItems(companyId, result.data.map((item) => item.id));
        result.data = result.data.map((item) => ({ ...item, labelPrintedAt: stats.get(item.id)?.labelPrintedAt ?? null, labelPrintCount: stats.get(item.id)?.labelPrintCount ?? 0 }));
      }
      if (hasPerm(c, "purchases.relation.read")) {
        const numbers = await loadPurchaseNumbersForItems(prisma, companyId, result.data.map((item) => item.id));
        result.data = result.data.map((item) => ({ ...item, purchaseOrderNumber: numbers.get(item.id)?.purchaseOrderNumber ?? null, purchaseInvoiceNumber: numbers.get(item.id)?.purchaseInvoiceNumber ?? null }));
      }
      // `pagination` is the shape RunlyTable reads for its page footer.
      return c.json({ ...result, pagination: { page: result.page, pageSize: result.limit, total: result.total } });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudieron cargar los items." }, 500);
    }
  });

  router.post("/inventory/items", requirePermission("inventory.item.create"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const authUserId = c.get("authUserId");
      // A limited user must create inside an area where they can write.
      const denied = await guards.rejectUnwritableArea(c, (await c.req.json().catch(() => null))?.areaId);
      if (denied) return denied;
      const { body, afterWrite } = await prepareItemWrite(c);
      const data = await modelDefaults.applyModelDefaults(body, companyId);
      const item = await inventoryService.createItem(data, companyId, authUserId, { afterWrite, scope: await scopeOf(c) });
      return c.json({ data: item }, 201);
    } catch (err) {
      const connectionError = itemConnections.errorResponse(c, err);
      if (connectionError) return connectionError;
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo crear el item." }, 500);
    }
  });

  router.get("/inventory/items/by-employee/:empId", requirePermission("inventory.assignment.read"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { empId } = c.req.param();
      const items = await inventoryService.getItemsByEmployee(empId, companyId, await scopeOf(c));
      return c.json({ data: items });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudieron cargar los items del colaborador." }, 500);
    }
  });

  router.get("/inventory/items/:id", requirePermission("inventory.item.read"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id } = c.req.param();
      const item = await inventoryService.getItem(id, companyId, await scopeOf(c));
      await attachUserAvatarUrls([item.assignedTo], { prisma, supabaseAdmin });
      // Purchase order / invoice shown as fields; only for users who can read Compras.
      const canReadPurchases = hasPerm(c, "purchases.relation.read");
      const links = canReadPurchases ? purchaseLinkFields(await loadPurchaseLinks(prisma, companyId, id)) : {};
      return c.json({ data: { ...item, ...links, canReadPurchases, canManagePurchases: hasPerm(c, "purchases.relation.manage") } });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo cargar el item." }, 500);
    }
  });

  router.put("/inventory/items/:id", requirePermission("inventory.item.update"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id } = c.req.param();
      // The path guard already required write access to the current area; moving needs the target too.
      const peek = await c.req.json().catch(() => null);
      const denied = peek && "areaId" in peek ? await guards.rejectUnwritableArea(c, peek.areaId) : null;
      if (denied) return denied;
      const { body, afterWrite } = await prepareItemWrite(c, id);
      const data = await modelDefaults.applyModelDefaults(body, companyId);
      const item = await inventoryService.updateItem(id, data, companyId, { afterWrite, actorAuthId: c.get("authUserId"), scope: await scopeOf(c) });
      return c.json({ data: item });
    } catch (err) {
      const connectionError = itemConnections.errorResponse(c, err);
      if (connectionError) return connectionError;
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo actualizar el item." }, 500);
    }
  });

  // PATCH alias — RunlyForm (the shared blueprint-driven form renderer) always
  // submits edits via PATCH, matching the convention already used by
  // PATCH /fleet/vehicles/:id. The PUT route above is kept for any other caller.
  router.patch("/inventory/items/:id", requirePermission("inventory.item.update"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id } = c.req.param();
      // The path guard already required write access to the current area; moving needs the target too.
      const peek = await c.req.json().catch(() => null);
      const denied = peek && "areaId" in peek ? await guards.rejectUnwritableArea(c, peek.areaId) : null;
      if (denied) return denied;
      const { body, afterWrite } = await prepareItemWrite(c, id);
      const data = await modelDefaults.applyModelDefaults(body, companyId);
      const item = await inventoryService.updateItem(id, data, companyId, { afterWrite, actorAuthId: c.get("authUserId"), scope: await scopeOf(c) });
      return c.json({ data: item });
    } catch (err) {
      const connectionError = itemConnections.errorResponse(c, err);
      if (connectionError) return connectionError;
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo actualizar el item." }, 500);
    }
  });

  router.delete("/inventory/items/:id", requirePermission("inventory.item.delete"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id } = c.req.param();
      await inventoryService.deleteItem(id, companyId, c.get("authUserId"));
      return c.json({ success: true });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo eliminar el item." }, 500);
    }
  });

  // Internal/automation (MirAI, integrations); the UI uses resguardos instead.
  router.post("/inventory/items/:id/assign", requirePermission("inventory.assignment.manage"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const authUserId = c.get("authUserId");
      const { id } = c.req.param();
      const { employeeId, notes } = await c.req.json();
      const result = await inventoryService.assignItem(id, employeeId, authUserId, notes, companyId);
      return c.json({ data: result }, 201);
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo asignar el item." }, 500);
    }
  });

  // Internal/automation (MirAI, integrations); the UI uses resguardos instead.
  router.post("/inventory/items/:id/return", requirePermission("inventory.assignment.manage"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const authUserId = c.get("authUserId");
      const { id } = c.req.param();
      const body = await c.req.json().catch(() => ({}));
      const result = await inventoryService.returnItem(id, authUserId, body.notes, companyId);
      return c.json({ data: result });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo registrar la devolucion del item." }, 500);
    }
  });

  router.get("/inventory/items/:id/assignments", requirePermission("inventory.assignment.read"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id } = c.req.param();
      const history = await inventoryService.getAssignmentHistory(id, companyId);
      await attachUserAvatarUrls(history.flatMap((row) => [row.employee, row.assignedBy]), { prisma, supabaseAdmin });
      return c.json({ data: history });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo cargar el historial de asignaciones." }, 500);
    }
  });

  // ── Item files ───────────────────────────────────────────────────────────
  // Every file attached to any item (Multimedia gallery). Registered before /inventory/items/:id routes.
  router.get("/inventory/media", requirePermission("inventory.item.read"), async (c) => {
    try {
      const { kind, search, itemId, sort, page, pageSize } = c.req.query();
      const companyId = c.get("companyId");
      // Same matching as the item list: full-text across related records + connected fields.
      let itemIds;
      if (String(search ?? "").trim()) {
        try {
          const connectionMatchIds = await itemConnections.searchIds(c, search);
          itemIds = [...new Set([...(await createInventorySearch({ prisma }).searchItemIds(companyId, search)), ...connectionMatchIds])];
        } catch (searchErr) {
          console.warn("[inventory] media search failed, using basic search:", searchErr?.code ?? searchErr?.name ?? "error");
        }
      }
      return c.json(await listInventoryMedia(prisma, companyId, { kind, search, itemId, itemIds, sort, page, pageSize }, await scopeOf(c)));
    } catch (err) {
      return c.json({ error: "No se pudo cargar la galería." }, 500);
    }
  });

  router.get("/inventory/items/:id/files", requirePermission("inventory.item.read"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id } = c.req.param();
      const files = await inventoryService.listItemFiles(id, companyId);
      const enriched = enrichFilesWithSignedUrls ? await enrichFilesWithSignedUrls(files) : files;
      return c.json({ data: enriched });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudieron cargar los archivos." }, 500);
    }
  });

  router.post("/inventory/items/:id/files", requirePermission("inventory.item.update"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id } = c.req.param();
      const body = await c.req.json();
      const fileAssetId = body.file_asset_id ?? body.fileAssetId;
      if (!fileAssetId) return c.json({ error: "file_asset_id is required" }, 400);
      if (filesService) {
        await filesService.getById({ authUserId: c.get('authUserId'), activeContext: tenantActiveContext(c), id: fileAssetId });
      }
      const record = await inventoryService.addItemFile(id, fileAssetId, companyId, body.label ?? null);
      await itemActivity(c, id, 'file.add', 'adjuntó un archivo', await fileName(fileAssetId));
      return c.json({ data: record }, 201);
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo asociar el archivo." }, 500);
    }
  });

  router.delete("/inventory/items/:id/files/:docId", requirePermission("inventory.item.update"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id, docId } = c.req.param();
      const doc = await prisma.invItemFile.findFirst({ where: { id: docId, itemId: id }, select: { fileAssetId: true } }).catch(() => null);
      const removedName = doc?.fileAssetId ? await fileName(doc.fileAssetId) : null;
      await inventoryService.removeItemFile(id, docId, companyId);
      await itemActivity(c, id, 'file.remove', 'eliminó un archivo', removedName);
      return c.json({ success: true });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo eliminar el archivo." }, 500);
    }
  });

  router.patch("/inventory/items/:id/files/:docId/cover", requirePermission("inventory.item.update"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id, docId } = c.req.param();
      const record = await inventoryService.setItemFileCover(id, docId, companyId);
      return c.json({ data: record });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo marcar la portada." }, 500);
    }
  });

  router.patch("/inventory/items/:id/files/reorder", requirePermission("inventory.item.update"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { id } = c.req.param();
      const { items } = await c.req.json();
      await inventoryService.reorderItemFiles(id, companyId, items);
      return c.json({ ok: true });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudo reordenar." }, 500);
    }
  });

  // ── Comments ─────────────────────────────────────────────────────────────
  router.get("/inventory/items/:id/comments", requirePermission("inventory.item.read"), async (c) => {
    try {
      const { id } = c.req.param();
      const comments = await commentsService.listComments("InvItem", id, c.get("companyId"), c.get("userId"));
      return c.json({ data: comments });
    } catch (err) {
      if (isCommentErr(err)) return c.json({ error: err.message }, err.status);
      return c.json({ error: "No se pudieron cargar los comentarios." }, 500);
    }
  });

  router.post("/inventory/items/:id/comments", requirePermission("inventory.item.update"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const authUserId = c.get("authUserId");
      const actorId = c.get("userId");
      const { id } = c.req.param();
      const { body } = await c.req.json();
      const comment = await commentsService.createComment("InvItem", id, authUserId, body, companyId);
      const mentionIds = comment.mentions?.map((m) => m.userId) ?? [];
      if (mentionIds.length > 0) {
        const members = await prisma.membership.findMany({
          where: { companyId, userId: { in: mentionIds }, enabled: true },
          select: { userId: true },
        });
        const validatedMentionIds = members.map((m) => m.userId);
        if (validatedMentionIds.length > 0) {
          await inventoryNotifSvc.notifyInvComment({ companyId, actorId, itemId: id, commentId: comment.id, mentionedUserIds: validatedMentionIds });
        }
      }
      return c.json({ data: comment }, 201);
    } catch (err) {
      if (isCommentErr(err)) return c.json({ error: err.message }, err.status);
      return c.json({ error: "No se pudo crear el comentario." }, 500);
    }
  });

  router.patch("/inventory/items/:id/comments/:cid", requirePermission("inventory.item.update"), async (c) => {
    try {
      const authUserId = c.get("authUserId");
      const { cid } = c.req.param();
      const { body } = await c.req.json();
      const comment = await commentsService.updateComment(cid, authUserId, body, c.get("companyId"), c.req.param("id"));
      return c.json({ data: comment });
    } catch (err) {
      if (isCommentErr(err)) return c.json({ error: err.message }, err.status);
      return c.json({ error: "No se pudo actualizar el comentario." }, 500);
    }
  });

  router.delete("/inventory/items/:id/comments/:cid", requirePermission("inventory.item.update"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const authUserId = c.get("authUserId");
      const { cid } = c.req.param();
      await commentsService.deleteComment(cid, authUserId, companyId, c.req.param("id"));
      return c.json({ success: true });
    } catch (err) {
      if (isCommentErr(err)) return c.json({ error: err.message }, err.status);
      return c.json({ error: "No se pudo eliminar el comentario." }, 500);
    }
  });

  router.post("/inventory/items/:id/comments/:cid/reactions", requirePermission("inventory.item.update"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const authUserId = c.get("authUserId");
      const actorId = c.get("userId");
      const { cid } = c.req.param();
      const { emoji } = await c.req.json();
      const result = await commentsService.toggleReaction(cid, authUserId, emoji, companyId, c.req.param("id"));
      if (!result.removed) {
        await inventoryNotifSvc.notifyInvReaction({ companyId, actorId, commentId: cid });
      }
      return c.json({ data: result });
    } catch (err) {
      if (isCommentErr(err)) return c.json({ error: err.message }, err.status);
      return c.json({ error: "No se pudo registrar la reaccion." }, 500);
    }
  });

  // ── Assignments list ─────────────────────────────────────────────────────
  router.get("/inventory/assignments", requirePermission("inventory.assignment.read"), async (c) => {
    try {
      const companyId = c.get("companyId");
      const { employeeId, itemId, active, page, limit } = c.req.query();
      const result = await inventoryService.listAllAssignments({ companyId, employeeId, itemId, active: active === "true", page: Number(page) || 1, limit: Number(limit) || 50, scope: await scopeOf(c) });
      return c.json(result);
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudieron cargar las asignaciones." }, 500);
    }
  });

  // ── Catalog: Categories / Brands / Locations / Custom Fields ──────────────
  const catalog = [
    ["categories", "catalog", "listCategories", "createCategory", "updateCategory", "deleteCategory", "reorderCategories", "la categoria", "las categorias"],
    ["brands", "catalog", "listBrands", "createBrand", "updateBrand", "deleteBrand", "reorderBrands", "la marca", "las marcas"],
    ["locations", "catalog", "listLocations", "createLocation", "updateLocation", "deleteLocation", "reorderLocations", "la ubicacion", "las ubicaciones"],
    ["conditions", "catalog", "listConditions", "createCondition", "updateCondition", "deleteCondition", "reorderConditions", "la condicion", "las condiciones"],
    ["custom-fields", "customfield", "listCustomFields", "createCustomField", "updateCustomField", "deleteCustomField", "reorderCustomFields", "el campo personalizado", "los campos personalizados"],
  ];

  router.get("/inventory/custom-fields/:id/values", requirePermission("inventory.catalog.read"), async (c) => {
    try {
      const data = await inventoryService.listCustomFieldValues(c.get("companyId"), c.req.param("id"), c.req.query("search"));
      return c.json({ data });
    } catch (err) {
      if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
      return c.json({ error: "No se pudieron cargar las sugerencias." }, 500);
    }
  });

  for (const [seg, permGroup, listFn, createFn, updateFn, deleteFn, reorderFn, singular, plural] of catalog) {
    router.get(`/inventory/${seg}`, requirePermission("inventory.catalog.read"), async (c) => {
      try {
        const companyId = c.get("companyId");
        const rows =
          seg === "custom-fields"
            ? await inventoryService[listFn](companyId, c.req.query().categoryId)
            : await inventoryService[listFn](companyId);
        return c.json({ data: rows });
      } catch (err) {
        if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
        return c.json({ error: `No se pudieron cargar ${plural}.` }, 500);
      }
    });

    router.post(`/inventory/${seg}`, requirePermission(`inventory.${permGroup}.manage`), async (c) => {
      try {
        const companyId = c.get("companyId");
        const data = await c.req.json();
        const row = await inventoryService[createFn](data, companyId);
        return c.json({ data: row }, 201);
      } catch (err) {
        if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
        return c.json({ error: `No se pudo crear ${singular}.` }, 500);
      }
    });

    router.patch(`/inventory/${seg}/reorder`, requirePermission(`inventory.${permGroup}.manage`), async (c) => {
      try {
        const companyId = c.get("companyId");
        const { items } = await c.req.json();
        await inventoryService[reorderFn](companyId, items);
        return c.json({ ok: true });
      } catch (err) {
        if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
        return c.json({ error: "No se pudo reordenar." }, 500);
      }
    });

    router.put(`/inventory/${seg}/:id`, requirePermission(`inventory.${permGroup}.manage`), async (c) => {
      try {
        const companyId = c.get("companyId");
        const { id } = c.req.param();
        const data = await c.req.json();
        const row = await inventoryService[updateFn](id, data, companyId);
        return c.json({ data: row });
      } catch (err) {
        if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
        return c.json({ error: `No se pudo actualizar ${singular}.` }, 500);
      }
    });

    router.delete(`/inventory/${seg}/:id`, requirePermission(`inventory.${permGroup}.manage`), async (c) => {
      try {
        const companyId = c.get("companyId");
        const { id } = c.req.param();
        await inventoryService[deleteFn](id, companyId);
        return c.json({ success: true });
      } catch (err) {
        if (isInvErr(err)) return c.json(invErrorBody(err), err.status);
        return c.json({ error: `No se pudo eliminar ${singular}.` }, 500);
      }
    });
  }

  return router;
}

export default createInventoryRouter;
