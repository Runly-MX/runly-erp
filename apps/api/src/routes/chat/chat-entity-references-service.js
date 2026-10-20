import { createUserAccessService } from '../../services/user-access-service.js';
import { createInventoryAccess } from '../../services/inventory-access.js';
import { createChatExtraEntityTypes, EXTRA_REFERENCE_PERMISSIONS } from './chat-entity-extra-types.js';

const MAX_ENTITY_REFS = 5;
const REFERENCE_PERMISSIONS = {
  contact: 'contacts.contacts.read', file: 'files.assets.read',
  hr_employee: 'hr.employee.read', project: 'projects.project.read',
  task: 'projects.task.read', calendar_event: 'calendar.events.read',
  ledger_account: 'ledger.accounts.read',
  vehicle: 'fleet.vehicles.read', inventory_item: 'inventory.item.read',
  ...EXTRA_REFERENCE_PERMISSIONS,
};

export function createChatEntityReferencesService({ prisma, contactsService, filesService, hrService, ledgerService, projectsService, tasksService, calendarEventService, fleetService, inventoryService, inventoryAccess = createInventoryAccess({ prisma }) }) {
  const access = createUserAccessService({ prisma });
  const extraTypes = createChatExtraEntityTypes({ prisma });
  // Not a static registry object keyed by entityType — each type's
  // underlying call shape genuinely differs (three take authUserId+id
  // directly, ledger needs companyId/actorId derived separately), so a
  // single if/else per type is clearer here than forcing a uniform shape
  // that doesn't actually hold across all four.
  async function resolveOne(authUserId, ctx, { entityType, recordId }) {
    try {
      const permission = REFERENCE_PERMISSIONS[entityType];
      if (!permission || !recordId) return null;
      await access.assertCompanyMember(ctx.companyId, ctx.profileId, permission);
      if (entityType === "contact") {
        const row = await contactsService.getById({ authUserId, companyId: ctx.companyId, id: recordId });
        if (!row) return null;
        // Contact has no photo/avatar column at all (checked the Prisma model —
        // genuinely absent, not just unread here) — phone/email is the richest
        // "at a glance" subtitle available without a schema change.
        return {
          entityType, recordId, title: row.name,
          subtitle: row.phone ?? row.email ?? null,
          url: `/app/m/runly.contacts/contacts/${recordId}`,
          email: row.email ?? null, phone: row.phone ?? null, avatarFileId: row.avatarFileId ?? null,
          details: [
            { label: "Teléfono", value: row.phone }, { label: "Correo", value: row.email },
            { label: "Razón social", value: row.legalName }, { label: "RFC", value: row.taxId },
            { label: "Giro", value: row.industry }, { label: "Sitio web", value: row.website },
          ].filter((d) => d.value),
        };
      }
      if (entityType === "file") {
        const row = await filesService.getById({ authUserId, activeContext: { ...ctx, isAdmin: false, permissionSet: new Set([permission]) }, id: recordId });
        if (!row) return null;
        return {
          entityType, recordId, title: row.originalName, subtitle: null,
          url: `/app/m/runly.files/files/${recordId}`,
          mimeType: row.mimeType ?? null,
          sizeBytes: row.sizeBytes ?? null,
        };
      }
      if (entityType === "hr_employee") {
        const row = await hrService.getEmployee({ authUserId, companyId: ctx.companyId, id: recordId });
        if (!row) return null;
        return {
          entityType, recordId, title: `${row.firstName} ${row.lastName}`.trim(),
          subtitle: row.jobTitleRef?.name ?? row.jobTitle ?? row.departmentRef?.name ?? row.department ?? null,
          url: `/app/m/runly.hr/hr/employees/${recordId}`,
          // hrService already includes both the employee's own profile photo
          // and their linked user account's avatar — prefer the employee
          // record's own photo, fall back to the account avatar.
          photoFileId: row.profileImageFileId ?? row.userProfile?.avatarFileId ?? null,
          details: [
            { label: "Puesto", value: row.jobTitleRef?.name ?? row.jobTitle }, { label: "Departamento", value: row.departmentRef?.name ?? row.department },
            { label: "Correo", value: row.workEmail }, { label: "Teléfono", value: row.phone }, { label: "Código", value: row.employeeCode },
          ].filter((d) => d.value),
        };
      }
      if (entityType === "project") {
        const project = await prisma.project.findFirst({ where: { id: recordId, companyId: ctx.companyId }, select: { id: true } });
        if (!project) return null;
        const row = await projectsService.getProject(recordId, ctx.profileId);
        return {
          entityType, recordId, title: row.name, subtitle: null,
          url: `/app/m/runly.projects/${recordId}`,
          color: row.color ?? null,
          icon: row.icon ?? null,
        };
      }
      if (entityType === "task") {
        const task = await prisma.task.findFirst({ where: { id: recordId, project: { companyId: ctx.companyId,
          OR: [{ ownerId: ctx.profileId }, { members: { some: { userId: ctx.profileId } } }],
        } }, select: { projectId: true } });
        if (!task) return null;
        const row = await tasksService.getTask(recordId, { projectId: task.projectId, companyId: ctx.companyId, actorId: ctx.profileId });
        if (!row) return null;
        return {
          entityType, recordId, title: row.title,
          subtitle: row.status?.name ?? null,
          url: `/app/m/runly.projects/tasks/${recordId}`,
        };
      }
      if (entityType === "calendar_event") {
        const row = await calendarEventService.getEvent(ctx.profileId, recordId, ctx.companyId);
        const startDate = new Date(row.startAt);
        const subtitle = Number.isNaN(startDate.getTime())
          ? null
          : startDate.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
        return {
          entityType, recordId, title: row.title, subtitle,
          url: `/app/m/runly.calendar/events/${recordId}`,
        };
      }
      if (entityType === "ledger_account") {
        const row = await ledgerService.getAccount({ companyId: ctx.companyId, accountId: recordId, actorId: ctx.profileId });
        if (!row) return null;
        // getAccount is a raw $queryRaw result, not a Prisma-mapped select —
        // multi-word columns come back snake_case (account_number,
        // current_balance), not camelCase. bank/name/currency happen to be
        // single-word and camelCase-compatible either way.
        const maskedNumber = row.account_number ? `····${String(row.account_number).slice(-4)}` : null;
        const subtitle = [row.bank, maskedNumber].filter(Boolean).join(" · ") || null;
        return {
          entityType, recordId,
          title: row.bank ? `${row.name} · ${row.bank}` : row.name,
          subtitle,
          url: `/app/m/runly.ledger/accounts/${recordId}`,
          currency: row.currency ?? null,
          balance: row.current_balance != null ? Number(row.current_balance) : null,
        };
      }
      if (entityType === "vehicle") {
        const row = await fleetService.getVehicle({ companyId: ctx.companyId, id: recordId });
        if (!row) return null;
        const modelInfo = [row.vehicle_brand_name, row.vehicle_model_name, row.vehicle_model_year].filter(Boolean).join(" ");
        return {
          entityType, recordId,
          title: row.plate || modelInfo || "Vehiculo",
          // status is surfaced as its own badge on the card (see
          // EntityReferenceCard.jsx), not duplicated into this subtitle text.
          subtitle: modelInfo || null,
          url: `/app/m/runly.fleet/vehicles/${recordId}`,
          status: row.status ?? null,
          coverImageFileId: row.cover_image_file_asset_id ?? null,
          details: [
            { label: "Placa", value: row.plate }, { label: "Vehículo", value: modelInfo },
            { label: "Estado", value: row.status }, { label: "Conductor", value: row.driver_name },
          ].filter((d) => d.value),
        };
      }
      if (entityType === "inventory_item") {
        const scope = await inventoryAccess.scopeFor({ companyId: ctx.companyId, actorId: ctx.profileId });
        const row = await inventoryService.getItem(recordId, ctx.companyId, scope);
        if (!row) return null;
        return {
          entityType, recordId, title: row.name,
          subtitle: [row.assetTag, row.categoryName].filter(Boolean).join(" · ") || null,
          url: `/app/m/runly.inventory/inventory/${recordId}`,
          status: row.status ?? null,
          coverImageFileId: row.coverImageFileId ?? null,
          details: [
            { label: "Número de activo", value: row.assetTag }, { label: "Número de serie", value: row.serialNumber },
            { label: "Tipo", value: row.categoryName }, { label: "Marca", value: row.brandName },
            { label: "Modelo", value: row.model }, { label: "Ubicación", value: row.locationName },
          ].filter((d) => d.value),
        };
      }
      if (EXTRA_REFERENCE_PERMISSIONS[entityType]) return await extraTypes.resolve(entityType, ctx.companyId, recordId);
      return null; // unknown entityType — drop silently
    } catch {
      return null; // any resolution failure (404/403/etc from the target service) — drop silently, never surface
    }
  }

  async function resolveEntityRefs({ authUserId, companyId, entityRefs }) {
    if (!companyId || !entityRefs?.length) return [];
    const profile = await prisma.userProfile.findUnique({ where: { authUserId }, select: { id: true } });
    if (!profile) return [];
    const ctx = { companyId, profileId: profile.id };
    const capped = entityRefs.slice(0, MAX_ENTITY_REFS);
    const resolved = await Promise.all(capped.map((ref) => resolveOne(authUserId, ctx, ref)));
    return resolved.filter(Boolean);
  }

  // Batch variant for relation fields of Builder modules (relation-targets
  // service): same per-type permission, company scope and shape, no 5-ref cap.
  async function resolveReferences({ authUserId, companyId, refs, limit = 100 }) {
    if (!companyId || !refs?.length) return [];
    const profile = await prisma.userProfile.findUnique({ where: { authUserId }, select: { id: true } });
    if (!profile) return [];
    const ctx = { companyId, profileId: profile.id };
    const resolved = await Promise.all(refs.slice(0, limit).map((ref) => resolveOne(authUserId, ctx, ref)));
    return resolved.filter(Boolean);
  }

  return { resolveEntityRefs, resolveReferences };
}
