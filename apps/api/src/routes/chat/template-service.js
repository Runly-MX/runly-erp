import { Prisma } from "@prisma/client";

export function createChatTemplateService({ prisma }) {
  async function listTemplates({ companyId, search }) {
    const rows = await prisma.$queryRaw`
      SELECT id, title, body, tags, usage_count AS "usageCount",
             created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM chat_message_templates
      WHERE company_id = ${companyId}::uuid
        AND enabled = true
        ${search ? Prisma.sql`AND (atlas_unaccent(title) ILIKE atlas_unaccent(${'%' + search + '%'}) OR atlas_unaccent(body) ILIKE atlas_unaccent(${'%' + search + '%'}))` : Prisma.empty}
      ORDER BY usage_count DESC, title ASC
    `;
    return rows;
  }

  async function createTemplate({ companyId, actorId, title, body, tags = [] }) {
    if (!title?.trim()) throw Object.assign(new Error("El titulo es requerido."), { status: 422 });
    if (!body?.trim()) throw Object.assign(new Error("El cuerpo es requerido."), { status: 422 });
    const rows = await prisma.$queryRaw`
      INSERT INTO chat_message_templates (company_id, created_by, title, body, tags)
      VALUES (${companyId}::uuid, ${actorId ?? null}::uuid, ${title.trim()}, ${body.trim()}, ${tags}::text[])
      RETURNING id, title, body, tags, usage_count AS "usageCount", created_at AS "createdAt"
    `;
    return rows[0];
  }

  async function updateTemplate({ companyId, templateId, title, body, tags }) {
    const rows = await prisma.$queryRaw`
      UPDATE chat_message_templates
      SET title = COALESCE(${title ?? null}, title),
          body = COALESCE(${body ?? null}, body),
          tags = COALESCE(${tags ?? null}::text[], tags),
          updated_at = NOW()
      WHERE id = ${templateId}::uuid AND company_id = ${companyId}::uuid AND enabled = true
      RETURNING id, title, body, tags, usage_count AS "usageCount", updated_at AS "updatedAt"
    `;
    if (!rows[0]) throw Object.assign(new Error("Template no encontrado."), { status: 404 });
    return rows[0];
  }

  async function deleteTemplate({ companyId, templateId }) {
    const result = await prisma.$executeRaw`
      UPDATE chat_message_templates
      SET enabled = false, updated_at = NOW()
      WHERE id = ${templateId}::uuid AND company_id = ${companyId}::uuid AND enabled = true
    `;
    if (result === 0) throw Object.assign(new Error("Template no encontrado."), { status: 404 });
    return { ok: true };
  }

  async function recordUsage({ companyId, templateId }) {
    await prisma.$executeRaw`
      UPDATE chat_message_templates
      SET usage_count = usage_count + 1, updated_at = NOW()
      WHERE id = ${templateId}::uuid AND company_id = ${companyId}::uuid AND enabled = true
    `;
    return { ok: true };
  }

  return { listTemplates, createTemplate, updateTemplate, deleteTemplate, recordUsage };
}
