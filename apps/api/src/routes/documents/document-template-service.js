import {
  documentBlocksSchema,
  documentTemplateCreateSchema,
  documentTemplateEnabledSchema,
  documentTemplateQuerySchema,
  documentTemplateUpdateSchema,
  documentVersionCreateSchema,
  documentVersionPublishSchema,
  documentVersionUpdateSchema,
  validateDocumentBindings,
} from "./document-validators.js";

export class DocumentTemplateServiceError extends Error {
  constructor(message, status = 400, code = "document_template_error", details) {
    super(message);
    this.name = "DocumentTemplateServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizedOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.trim() || null;
}

function toAuditJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.parse(JSON.stringify(value));
}

function auditData({
  actorId,
  entityType,
  entityId,
  action,
  before,
  after,
  companyId,
  metadata,
}) {
  return {
    actorId: actorId ?? null,
    moduleKey: "runly.documents",
    entityType,
    entityId,
    action,
    before: toAuditJson(before),
    after: toAuditJson(after),
    metadata: {
      companyId,
      ...(metadata ?? {}),
    },
  };
}

export function createDocumentTemplateService({
  prisma,
  providerRegistry,
  now = () => new Date(),
}) {
  async function getTemplateRecord(db, { companyId, id }) {
    const template = await db.documentTemplate.findFirst({
      where: { id, companyId },
    });
    if (!template) {
      throw new DocumentTemplateServiceError(
        "Plantilla no encontrada.",
        404,
        "template_not_found",
      );
    }
    return template;
  }

  async function getVersionRecord(db, { companyId, templateId, versionId }) {
    const version = await db.documentTemplateVersion.findFirst({
      where: {
        id: versionId,
        templateId,
        template: { companyId },
      },
      include: {
        template: true,
      },
    });
    if (!version) {
      throw new DocumentTemplateServiceError(
        "Version de plantilla no encontrada.",
        404,
        "template_version_not_found",
      );
    }
    return version;
  }

  function assertDraft(version) {
    if (version.status !== "draft") {
      throw new DocumentTemplateServiceError(
        "Las versiones publicadas son inmutables.",
        409,
        "published_version_immutable",
      );
    }
  }

  function assertProviderAccess({ sourceType, permissions, isAdmin }) {
    return providerRegistry.getSchema({
      sourceType,
      permissionKeys: permissions,
      isAdmin,
    });
  }

  async function listTemplates({ companyId, query = {} }) {
    const parsed = documentTemplateQuerySchema.parse(query);
    const where = {
      companyId,
      // File templates (docx/xlsx/pptx/pdf) are listed by /documents/templates?kind=.
      format: "blocks",
      enabled: parsed.enabled,
      ...(parsed.sourceType ? { sourceType: parsed.sourceType } : {}),
      ...(parsed.search
        ? {
            OR: [
              { key: { contains: parsed.search, mode: "insensitive" } },
              { name: { contains: parsed.search, mode: "insensitive" } },
              {
                description: {
                  contains: parsed.search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };
    const skip = (parsed.page - 1) * parsed.pageSize;
    const [total, items] = await Promise.all([
      prisma.documentTemplate.count({ where }),
      prisma.documentTemplate.findMany({
        where,
        include: {
          publishedVersion: true,
          _count: { select: { versions: true, generatedDocuments: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: parsed.pageSize,
      }),
    ]);
    return {
      items,
      total,
      page: parsed.page,
      pageSize: parsed.pageSize,
    };
  }

  async function createTemplate({
    companyId,
    actorId,
    permissions,
    isAdmin,
    input,
  }) {
    const parsed = documentTemplateCreateSchema.parse(input);
    assertProviderAccess({
      sourceType: parsed.sourceType,
      permissions,
      isAdmin,
    });

    return prisma.$transaction(async (tx) => {
      let created;
      try {
        created = await tx.documentTemplate.create({
          data: {
            companyId,
            key: parsed.key,
            name: parsed.name,
            description: normalizedOptionalText(parsed.description) ?? null,
            sourceType: parsed.sourceType,
          },
        });
      } catch (error) {
        if (error?.code === "P2002") {
          throw new DocumentTemplateServiceError(
            "Ya existe una plantilla con esa clave.",
            409,
            "template_key_conflict",
          );
        }
        throw error;
      }
      await tx.auditLog.create({
        data: auditData({
          actorId,
          companyId,
          entityType: "DocumentTemplate",
          entityId: created.id,
          action: "documents.template.create",
          after: created,
        }),
      });
      return created;
    });
  }

  async function getTemplate({ companyId, id }) {
    const template = await prisma.documentTemplate.findFirst({
      where: { id, companyId },
      include: {
        publishedVersion: true,
        _count: { select: { versions: true, generatedDocuments: true } },
      },
    });
    if (!template) {
      throw new DocumentTemplateServiceError(
        "Plantilla no encontrada.",
        404,
        "template_not_found",
      );
    }
    return template;
  }

  async function updateTemplate({
    companyId,
    id,
    actorId,
    permissions,
    isAdmin,
    input,
  }) {
    const parsed = documentTemplateUpdateSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const current = await getTemplateRecord(tx, { companyId, id });
      const sourceType = parsed.sourceType ?? current.sourceType;
      if (parsed.sourceType) {
        if (
          current.publishedVersionId &&
          parsed.sourceType !== current.sourceType
        ) {
          throw new DocumentTemplateServiceError(
            "No se puede cambiar el origen de una plantilla publicada.",
            409,
            "published_template_source_immutable",
          );
        }
        assertProviderAccess({ sourceType, permissions, isAdmin });
      }
      const updatedAt = now();
      const data = {
        ...(parsed.key ? { key: parsed.key } : {}),
        ...(parsed.name ? { name: parsed.name } : {}),
        ...(parsed.description !== undefined
          ? { description: normalizedOptionalText(parsed.description) }
          : {}),
        ...(parsed.sourceType ? { sourceType: parsed.sourceType } : {}),
        updatedAt,
      };
      let result;
      try {
        result = await tx.documentTemplate.updateMany({
          where: {
            id,
            companyId,
            updatedAt: new Date(parsed.updatedAt),
          },
          data,
        });
      } catch (error) {
        if (error?.code === "P2002") {
          throw new DocumentTemplateServiceError(
            "Ya existe una plantilla con esa clave.",
            409,
            "template_key_conflict",
          );
        }
        throw error;
      }
      if (result.count !== 1) {
        throw new DocumentTemplateServiceError(
          "La plantilla fue actualizada por otro usuario.",
          409,
          "template_update_conflict",
        );
      }
      const updated = { ...current, ...data };
      await tx.auditLog.create({
        data: auditData({
          actorId,
          companyId,
          entityType: "DocumentTemplate",
          entityId: id,
          action: "documents.template.update",
          before: current,
          after: updated,
        }),
      });
      return updated;
    });
  }

  async function setTemplateEnabled({ companyId, id, actorId, input }) {
    const parsed = documentTemplateEnabledSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const current = await getTemplateRecord(tx, { companyId, id });
      const updatedAt = now();
      const result = await tx.documentTemplate.updateMany({
        where: {
          id,
          companyId,
          updatedAt: new Date(parsed.updatedAt),
        },
        data: {
          enabled: parsed.enabled,
          updatedAt,
        },
      });
      if (result.count !== 1) {
        throw new DocumentTemplateServiceError(
          "La plantilla fue actualizada por otro usuario.",
          409,
          "template_update_conflict",
        );
      }
      const updated = { ...current, enabled: parsed.enabled, updatedAt };
      await tx.auditLog.create({
        data: auditData({
          actorId,
          companyId,
          entityType: "DocumentTemplate",
          entityId: id,
          action: parsed.enabled
            ? "documents.template.enable"
            : "documents.template.disable",
          before: current,
          after: updated,
        }),
      });
      return updated;
    });
  }

  async function listVersions({ companyId, templateId }) {
    await getTemplateRecord(prisma, { companyId, id: templateId });
    return prisma.documentTemplateVersion.findMany({
      where: { templateId },
      orderBy: { versionNumber: "desc" },
    });
  }

  async function createVersion({ companyId, templateId, actorId, input }) {
    const parsed = documentVersionCreateSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const template = await getTemplateRecord(tx, {
        companyId,
        id: templateId,
      });
      if (!template.enabled) {
        throw new DocumentTemplateServiceError(
          "La plantilla esta deshabilitada.",
          409,
          "template_disabled",
        );
      }
      const latest = await tx.documentTemplateVersion.findFirst({
        where: { templateId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      let created;
      try {
        created = await tx.documentTemplateVersion.create({
          data: {
            templateId,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            status: "draft",
            blocks: parsed.blocks,
            createdById: actorId ?? null,
          },
        });
      } catch (error) {
        if (error?.code === "P2002") {
          throw new DocumentTemplateServiceError(
            "Otra version fue creada al mismo tiempo. Vuelve a intentar.",
            409,
            "template_version_conflict",
          );
        }
        throw error;
      }
      await tx.auditLog.create({
        data: auditData({
          actorId,
          companyId,
          entityType: "DocumentTemplateVersion",
          entityId: created.id,
          action: "documents.template.version.create",
          after: created,
          metadata: { templateId },
        }),
      });
      return created;
    });
  }

  async function updateVersion({
    companyId,
    templateId,
    versionId,
    actorId,
    input,
  }) {
    const parsed = documentVersionUpdateSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const current = await getVersionRecord(tx, {
        companyId,
        templateId,
        versionId,
      });
      assertDraft(current);
      const updatedAt = now();
      const result = await tx.documentTemplateVersion.updateMany({
        where: {
          id: versionId,
          templateId,
          status: "draft",
          updatedAt: new Date(parsed.updatedAt),
        },
        data: {
          blocks: parsed.blocks,
          updatedAt,
        },
      });
      if (result.count !== 1) {
        throw new DocumentTemplateServiceError(
          "La version fue actualizada por otro usuario.",
          409,
          "template_version_update_conflict",
        );
      }
      const updated = { ...current, blocks: parsed.blocks, updatedAt };
      await tx.auditLog.create({
        data: auditData({
          actorId,
          companyId,
          entityType: "DocumentTemplateVersion",
          entityId: versionId,
          action: "documents.template.version.update",
          before: current,
          after: updated,
          metadata: { templateId },
        }),
      });
      return updated;
    });
  }

  async function publishVersion({
    companyId,
    templateId,
    versionId,
    actorId,
    permissions,
    isAdmin,
    input,
  }) {
    const parsed = documentVersionPublishSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const template = await getTemplateRecord(tx, {
        companyId,
        id: templateId,
      });
      if (!template.enabled) {
        throw new DocumentTemplateServiceError(
          "La plantilla esta deshabilitada.",
          409,
          "template_disabled",
        );
      }
      const version = await getVersionRecord(tx, {
        companyId,
        templateId,
        versionId,
      });
      assertDraft(version);
      const blocks = documentBlocksSchema.parse(version.blocks);
      const providerSchema = assertProviderAccess({
        sourceType: template.sourceType,
        permissions,
        isAdmin,
      });
      const bindingIssues = validateDocumentBindings({
        blocks,
        providerSchema,
      });
      if (bindingIssues.length) {
        throw new DocumentTemplateServiceError(
          "La plantilla contiene bindings desconocidos.",
          422,
          "unknown_document_binding",
          bindingIssues,
        );
      }

      const publishedAt = now();
      const versionUpdate = await tx.documentTemplateVersion.updateMany({
        where: {
          id: versionId,
          templateId,
          status: "draft",
          updatedAt: new Date(parsed.updatedAt),
        },
        data: {
          status: "published",
          publishedAt,
          updatedAt: publishedAt,
        },
      });
      if (versionUpdate.count !== 1) {
        throw new DocumentTemplateServiceError(
          "La version fue actualizada por otro usuario.",
          409,
          "template_version_update_conflict",
        );
      }
      const updatedTemplate = await tx.documentTemplate.update({
        where: { id: templateId },
        data: {
          publishedVersionId: versionId,
          updatedAt: publishedAt,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId,
          companyId,
          entityType: "DocumentTemplateVersion",
          entityId: versionId,
          action: "documents.template.version.publish",
          before: version,
          after: {
            ...version,
            status: "published",
            publishedAt,
            updatedAt: publishedAt,
          },
          metadata: { templateId },
        }),
      });
      return updatedTemplate;
    });
  }

  return {
    listTemplates,
    createTemplate,
    getTemplate,
    updateTemplate,
    setTemplateEnabled,
    listVersions,
    createVersion,
    updateVersion,
    publishVersion,
  };
}
