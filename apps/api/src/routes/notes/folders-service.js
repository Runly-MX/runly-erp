export class FoldersServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "FoldersServiceError";
    this.status = status;
  }
}

export function createFoldersService({ prisma }) {
  async function assertFolder({ folderId, userId, companyId }) {
    if (!folderId) return;
    const [folder] = await prisma.$queryRaw`
      SELECT id FROM note_folders WHERE id = ${folderId}::uuid
        AND owner_user_id = ${userId}::uuid
        AND company_id IS NOT DISTINCT FROM ${companyId ?? null}::uuid
    `;
    if (!folder) throw new FoldersServiceError("Carpeta no encontrada.", 404);
  }
  // ------------------------------------------------------------------
  // List
  // ------------------------------------------------------------------

  async function listFolders({ userId, companyId }) {
    const rows = await prisma.$queryRaw`
      SELECT f.*, FALSE AS is_shared_with_me, NULL::text AS my_permission, NULL::text AS owner_display_name,
        EXISTS (SELECT 1 FROM note_folder_shares s WHERE s.folder_id = f.id) AS is_shared
      FROM note_folders f
      WHERE f.owner_user_id = ${userId}
        AND (f.company_id = ${companyId ?? null}::uuid OR f.company_id IS NULL)
      UNION ALL
      SELECT f.*, TRUE, fs.permission, up.display_name, TRUE
      FROM note_folder_shares fs
      JOIN note_folders f ON f.id = fs.folder_id
      JOIN user_profile up ON up.id = f.owner_user_id
      WHERE fs.shared_with_user_id = ${userId}
        AND (f.company_id = ${companyId ?? null}::uuid OR f.company_id IS NULL)
      ORDER BY is_shared_with_me, sort_order ASC, name ASC
    `;
    return rows;
  }

  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------

  async function createFolder({ userId, companyId, name, color, icon, parentFolderId, sortOrder }) {
    await assertFolder({ folderId: parentFolderId, userId, companyId });
    const rows = await prisma.$queryRaw`
      INSERT INTO note_folders (
        owner_user_id,
        company_id,
        name,
        color,
        icon,
        parent_folder_id,
        sort_order
      )
      VALUES (
        ${userId},
        ${companyId ?? null}::uuid,
        ${name},
        ${color ?? null}::text,
        ${icon ?? null}::text,
        ${parentFolderId ?? null}::uuid,
        ${sortOrder ?? 0}
      )
      RETURNING *
    `;
    return rows[0];
  }

  // ------------------------------------------------------------------
  // Update
  // ------------------------------------------------------------------

  async function updateFolder(folderId, userId, data, companyId) {
    const existing = await prisma.$queryRaw`
      SELECT id, company_id
      FROM note_folders
      WHERE id = ${folderId}
        AND owner_user_id = ${userId}
        AND (company_id = ${companyId ?? null}::uuid OR company_id IS NULL)
      LIMIT 1
    `;

    if (!existing.length) {
      throw new FoldersServiceError("Carpeta no encontrada.", 404);
    }

    await assertFolder({ folderId: data.parentFolderId, userId, companyId: existing[0].company_id });
    if (data.parentFolderId === folderId) throw new FoldersServiceError("Una carpeta no puede contenerse a si misma.", 400);

    const rows = await prisma.$queryRaw`
      UPDATE note_folders
      SET
        name             = COALESCE(${data.name ?? null}::text, name),
        color            = CASE
                             WHEN ${data.color !== undefined ? "t" : "f"}::boolean = TRUE
                             THEN ${data.color ?? null}::text
                             ELSE color
                           END,
        icon             = CASE
                             WHEN ${data.icon !== undefined ? "t" : "f"}::boolean = TRUE
                             THEN ${data.icon ?? null}::text
                             ELSE icon
                           END,
        parent_folder_id = CASE
                             WHEN ${data.parentFolderId !== undefined ? "t" : "f"}::boolean = TRUE
                             THEN ${data.parentFolderId ?? null}::uuid
                             ELSE parent_folder_id
                           END,
        sort_order       = COALESCE(${data.sortOrder ?? null}::integer, sort_order),
        updated_at       = NOW()
      WHERE id = ${folderId}
        AND owner_user_id = ${userId}
        AND (company_id = ${companyId ?? null}::uuid OR company_id IS NULL)
      RETURNING *
    `;

    if (!rows.length) {
      throw new FoldersServiceError("Carpeta no encontrada.", 404);
    }

    return rows[0];
  }

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  async function deleteFolder(folderId, userId, companyId) {
    const existing = await prisma.$queryRaw`
      SELECT id
      FROM note_folders
      WHERE id = ${folderId}
        AND owner_user_id = ${userId}
        AND (company_id = ${companyId ?? null}::uuid OR company_id IS NULL)
      LIMIT 1
    `;

    if (!existing.length) {
      throw new FoldersServiceError("Carpeta no encontrada.", 404);
    }

    await prisma.$executeRaw`
      DELETE FROM note_folders
      WHERE id = ${folderId}
        AND owner_user_id = ${userId}
        AND (company_id = ${companyId ?? null}::uuid OR company_id IS NULL)
    `;

    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  return { listFolders, createFolder, updateFolder, deleteFolder, assertFolder };
}
