// History of generated documents (GeneratedDocument rows written by the
// documents engine): list, detail, download link and enable/disable.
import {
  documentGeneratedEnabledSchema,
  documentGeneratedQuerySchema,
} from "./document-validators.js";

const SIGNED_URL_SECONDS = 3600;

export class DocumentGenerationServiceError extends Error {
  constructor(message, status = 400, code = "document_generation_error") {
    super(message);
    this.name = "DocumentGenerationServiceError";
    this.status = status;
    this.code = code;
  }
}

function auditJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.parse(JSON.stringify(value));
}

export function createDocumentGenerationService({ prisma, supabaseAdmin }) {
  async function listGenerated({ companyId, query = {} }) {
    const parsed = documentGeneratedQuerySchema.parse(query);
    const where = {
      companyId,
      enabled: parsed.enabled,
      ...(parsed.templateId ? { templateId: parsed.templateId } : {}),
      ...(parsed.sourceType ? { sourceType: parsed.sourceType } : {}),
      ...(parsed.sourceId ? { sourceId: parsed.sourceId } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.generatedDocument.count({ where }),
      prisma.generatedDocument.findMany({
        where,
        include: {
          template: true,
          version: true,
          fileAsset: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (parsed.page - 1) * parsed.pageSize,
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

  async function getGenerated({ companyId, id }) {
    const generated = await prisma.generatedDocument.findFirst({
      where: { id, companyId },
      include: {
        template: true,
        version: true,
        fileAsset: true,
      },
    });
    if (!generated) {
      throw new DocumentGenerationServiceError(
        "Documento generado no encontrado.",
        404,
        "generated_document_not_found",
      );
    }
    return generated;
  }

  async function getGeneratedDownload({ companyId, id }) {
    const generated = await getGenerated({ companyId, id });
    if (!generated.enabled || generated.status !== "ready" || !generated.fileAsset) {
      throw new DocumentGenerationServiceError(
        "El archivo generado no esta disponible.",
        409,
        "generated_file_unavailable",
      );
    }
    const { data, error } = await supabaseAdmin.storage
      .from(generated.fileAsset.bucket)
      .createSignedUrl(generated.fileAsset.objectKey, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new DocumentGenerationServiceError(
        "No se pudo preparar la descarga.",
        500,
        "generated_download_failed",
      );
    }
    return { url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS };
  }

  async function setGeneratedEnabled({ companyId, id, actorId, input }) {
    const parsed = documentGeneratedEnabledSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const current = await tx.generatedDocument.findFirst({
        where: { id, companyId },
      });
      if (!current) {
        throw new DocumentGenerationServiceError(
          "Documento generado no encontrado.",
          404,
          "generated_document_not_found",
        );
      }
      const updated = await tx.generatedDocument.update({
        where: { id },
        data: { enabled: parsed.enabled },
      });
      await tx.auditLog.create({
        data: {
          actorId: actorId ?? null,
          moduleKey: "runly.documents",
          entityType: "GeneratedDocument",
          entityId: id,
          action: parsed.enabled
            ? "documents.generated.enable"
            : "documents.generated.disable",
          before: auditJson(current),
          after: auditJson(updated),
          metadata: { companyId },
        },
      });
      return updated;
    });
  }

  return {
    listGenerated,
    getGenerated,
    getGeneratedDownload,
    setGeneratedEnabled,
  };
}
