import { createFoldersService } from './folders-service.js';
import { createNoteReferencesService } from './references-service.js';
import * as Y from 'yjs';
import { createYDocService } from './ydoc-service.js';
import { parseAppendText, blocksToHtml, blocksToPlainText, appendBlocksToYDoc } from './append-blocks.js';
import { exceedsDepth, isUuid, MAX_DEPTH_MESSAGE, shouldCascadeArchive } from './subpages.js';

const MAX_APPEND_CHARS = 20000;

export class NotesServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "NotesServiceError";
    this.status = status;
  }
}

// [payload key, column, value the UPDATE writes when the payload value is nullish]
const UPDATABLE_FIELDS = [
  ["title", "title", ""],
  ["content", "content", ""],
  ["contentText", "content_text", ""],
  ["icon", "icon", ""],
  ["backgroundColor", "background_color", null],
  ["backgroundImageUrl", "background_image_url", null],
  ["paperStyle", "paper_style", "none"],
  ["paperMargin", "paper_margin", false],
  ["paperTexture", "paper_texture", false],
  ["paperShadow", "paper_shadow", false],
  ["showPublicCollaborators", "show_public_collaborators", true],
  ["coverUrl", "cover_url", null],
  ["folderId", "folder_id", null],
  ["isPinned", "is_pinned", null],
  ["isArchived", "is_archived", null],
  ["wordCount", "word_count", null],
];

function comparable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function hasNoteChanges(current, data) {
  return UPDATABLE_FIELDS.some(([key, column, fallback]) => {
    if (data[key] === undefined) return false;
    return comparable(data[key] ?? fallback) !== comparable(current[column]);
  });
}

export function createNotesService({ prisma, broadcaster = null }) {
  const folders = createFoldersService({ prisma });
  const references = createNoteReferencesService({ prisma });
  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /**
   * assertAccess — verifies that userId is allowed to access noteId.
   * Returns { isOwner, sharePermission } on success.
   * Throws NotesServiceError 404 if note doesn't exist.
   * Throws NotesServiceError 403 if requiredPermission is not satisfied.
   */
  async function assertAccess(noteId, userId, requiredPermission = "read") {
    const rows = await prisma.$queryRaw`
      SELECT
        n.id,
        n.owner_user_id,
        n.company_id,
        ns.permission AS share_permission
      FROM notes n
      LEFT JOIN note_shares ns
        ON ns.note_id = n.id
        AND ns.shared_with_user_id = ${userId}
      WHERE n.id = ${noteId}
        AND n.deleted_at IS NULL
        AND public.runly_note_user_access(n.id, ${userId}::uuid, false)
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotesServiceError("Nota no encontrada.", 404);
    }

    const row = rows[0];
    const isOwner = row.owner_user_id === userId;
    const sharePermission = row.share_permission ?? null;

    if (requiredPermission === "edit") {
      if (!isOwner && sharePermission !== "edit") {
        throw new NotesServiceError("No tienes permiso para editar esta nota.", 403);
      }
    } else {
      // read
      if (!isOwner && !sharePermission) {
        throw new NotesServiceError("No tienes acceso a esta nota.", 403);
      }
    }

    return { isOwner, sharePermission, companyId: row.company_id, ownerId: row.owner_user_id };
  }

  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------

  // Child of an existing note: needs edit access to the parent, inherits its
  // company and folder, copies its share grants and respects the depth limit.
  async function createSubpage({ userId, parentId, title, content, icon, backgroundColor, noteType }) {
    if (!isUuid(parentId)) throw new NotesServiceError("Nota padre no valida.", 400);
    const access = await assertAccess(parentId, userId, "edit");
    const [parent] = await prisma.$queryRaw`
      SELECT id, folder_id, company_id, owner_user_id, is_trashed
      FROM notes
      WHERE id = ${parentId}::uuid AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!parent) throw new NotesServiceError("Nota no encontrada.", 404);
    if (parent.is_trashed) {
      throw new NotesServiceError("No se puede crear una subpagina en una nota de la papelera.", 422);
    }
    const [{ depth }] = await prisma.$queryRaw`
      WITH RECURSIVE chain AS (
        SELECT id, parent_note_id, 1 AS lvl FROM notes WHERE id = ${parentId}::uuid
        UNION ALL
        SELECT n.id, n.parent_note_id, c.lvl + 1
        FROM notes n JOIN chain c ON n.id = c.parent_note_id
        WHERE c.lvl < 10
      )
      SELECT COUNT(*)::int AS depth FROM chain
    `;
    if (exceedsDepth(depth)) throw new NotesServiceError(MAX_DEPTH_MESSAGE, 422);
    const type = noteType === 'canvas' ? 'canvas' : 'document';

    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        INSERT INTO notes (
          owner_user_id, company_id, folder_id, parent_note_id,
          title, content, icon, background_color, note_type
        )
        VALUES (
          ${userId}::uuid,
          ${parent.company_id ?? null}::uuid,
          ${parent.folder_id ?? null}::uuid,
          ${parentId}::uuid,
          ${title ?? "Sin titulo"},
          ${JSON.stringify(content ?? '')}::jsonb,
          ${icon ?? ''},
          ${backgroundColor ?? null},
          ${type}::text
        )
        RETURNING *
      `;
      const child = rows[0];
      // The child must be as visible as its parent: same collaborators, plus the
      // parent's owner when somebody else (an editor) creates the page.
      await tx.$executeRaw`
        INSERT INTO note_shares (note_id, shared_with_user_id, shared_by_user_id, permission, external_access)
        SELECT ${child.id}::uuid, s.shared_with_user_id, s.shared_by_user_id, s.permission, s.external_access
        FROM note_shares s
        WHERE s.note_id = ${parentId}::uuid AND s.shared_with_user_id <> ${userId}::uuid
        UNION ALL
        SELECT ${child.id}::uuid, ${access.ownerId}::uuid, ${userId}::uuid, 'edit', FALSE
        WHERE ${access.ownerId}::uuid <> ${userId}::uuid
        ON CONFLICT (note_id, shared_with_user_id) DO NOTHING
      `;
      return child;
    });
  }

  async function createNote({ userId, companyId, folderId, parentId, title, content, icon, backgroundColor, noteType }) {
    if (parentId) return createSubpage({ userId, parentId, title, content, icon, backgroundColor, noteType });
    await folders.assertFolder({ folderId, userId, companyId });
    const type = noteType === 'canvas' ? 'canvas' : 'document';
    const rows = await prisma.$queryRaw`
      INSERT INTO notes (
        owner_user_id,
        company_id,
        folder_id,
        title,
        content,
        icon,
        background_color,
        note_type
      )
      VALUES (
        ${userId},
        ${companyId ?? null}::uuid,
        ${folderId ?? null}::uuid,
        ${title ?? "Sin titulo"},
        ${JSON.stringify(content ?? '')}::jsonb,
        ${icon ?? ''},
        ${backgroundColor ?? null},
        ${type}::text
      )
      RETURNING *
    `;
    return rows[0];
  }

  // ------------------------------------------------------------------
  // Read one
  // ------------------------------------------------------------------

  async function getNote(noteId, userId) {
    await assertAccess(noteId, userId, "read");

    const rows = await prisma.$queryRaw`
      SELECT
        n.*,
        up.display_name      AS owner_display_name,
        up.avatar_file_id    AS owner_avatar_file_id,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id',    nt.id,
              'name',  nt.name,
              'color', nt.color
            )
          ) FILTER (WHERE nt.id IS NOT NULL),
          '[]'
        ) AS tags,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id',            ns.id,
              'userId',        ns.shared_with_user_id,
              'permission',    ns.permission,
              'displayName',   sup.display_name,
              'avatarFileId',  sup.avatar_file_id
            )
          ) FILTER (WHERE ns.id IS NOT NULL),
          '[]'
        ) AS shares
      FROM notes n
      LEFT JOIN user_profile up
        ON up.id = n.owner_user_id
      LEFT JOIN note_tag_assignments nta
        ON nta.note_id = n.id
      LEFT JOIN note_tags nt
        ON nt.id = nta.tag_id
        AND nt.company_id IS NOT DISTINCT FROM n.company_id
      LEFT JOIN note_shares ns
        ON ns.note_id = n.id
      LEFT JOIN user_profile sup
        ON sup.id = ns.shared_with_user_id
      WHERE n.id = ${noteId}
        AND n.deleted_at IS NULL
        AND public.runly_note_user_access(n.id, ${userId}::uuid, false)
      GROUP BY n.id, up.display_name, up.avatar_file_id
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotesServiceError("Nota no encontrada.", 404);
    }

    const note = rows[0];
    const ancestors = note.parent_note_id ? await listAncestors(note, userId) : [];
    return { ...note, ancestors };
  }

  // Root-first chain of the note's ancestors; stops at the first one the user
  // cannot access (or that lives in another company).
  async function listAncestors(note, userId) {
    return prisma.$queryRaw`
      WITH RECURSIVE chain AS (
        SELECT p.id, p.title, p.icon, p.parent_note_id, 1 AS lvl
        FROM notes p
        WHERE p.id = ${note.parent_note_id}::uuid
          AND p.deleted_at IS NULL
          AND p.company_id IS NOT DISTINCT FROM ${note.company_id ?? null}::uuid
          AND public.runly_note_user_access(p.id, ${userId}::uuid, false)
        UNION ALL
        SELECT p.id, p.title, p.icon, p.parent_note_id, c.lvl + 1
        FROM notes p JOIN chain c ON p.id = c.parent_note_id
        WHERE c.lvl < 10
          AND p.deleted_at IS NULL
          AND p.company_id IS NOT DISTINCT FROM ${note.company_id ?? null}::uuid
          AND public.runly_note_user_access(p.id, ${userId}::uuid, false)
      )
      SELECT id, title, icon FROM chain ORDER BY lvl DESC
    `;
  }

  // ------------------------------------------------------------------
  // List
  // ------------------------------------------------------------------

  async function listNotes({
    userId,
    companyId,
    folderId,
    parentId,
    includeSubpages = false,
    tagId,
    q,
    archived,
    trashed,
    shared,
    page = 1,
    pageSize = 30,
    restrictCompany = false,
  } = {}) {
    const offset = (page - 1) * pageSize;
    const isTrashed = trashed ?? false;
    const isArchived = archived ?? false;

    // Build conditional clauses using explicit booleans.
    // We use a CTE to filter accessible notes, then join for enrichment.
    const rows = await prisma.$queryRaw`
      WITH accessible AS (
        SELECT
          n.*,
          (n.owner_user_id = ${userId}) AS is_owner,
          ns_mine.permission              AS my_share_permission,
          (
            SELECT COUNT(*)::int FROM notes ch
            WHERE ch.parent_note_id = n.id
              AND ch.deleted_at IS NULL
              AND ch.is_trashed = FALSE
              AND public.runly_note_user_access(ch.id, ${userId}::uuid, false)
          ) AS child_count
        FROM notes n
        LEFT JOIN note_shares ns_mine
          ON ns_mine.note_id = n.id
          AND ns_mine.shared_with_user_id = ${userId}
        WHERE (n.company_id = ${companyId ?? null}::uuid OR n.company_id IS NULL OR ns_mine.external_access)
          AND (NOT ${restrictCompany}::boolean OR n.company_id = ${companyId ?? null}::uuid OR n.company_id IS NULL)
          AND n.deleted_at IS NULL
          AND public.runly_note_user_access(n.id, ${userId}::uuid, false)
          AND n.is_trashed   = ${isTrashed}
          AND n.is_archived  = ${isArchived}
          AND (
            n.owner_user_id = ${userId}
            OR ns_mine.id IS NOT NULL
          )
          -- With parentId: that note's direct children. Without it: root notes
          -- only, plus children whose accessible parent is in another state
          -- (trashed/archived on their own) or that have no accessible parent.
          AND (
            CASE
              WHEN ${parentId ?? null}::uuid IS NOT NULL THEN n.parent_note_id = ${parentId ?? null}::uuid
              ELSE (
                n.parent_note_id IS NULL
                OR ${includeSubpages}::boolean
                OR NOT EXISTS (
                  SELECT 1 FROM notes par
                  WHERE par.id = n.parent_note_id
                    AND par.deleted_at IS NULL
                    AND par.is_trashed = n.is_trashed
                    AND (NOT n.is_archived OR par.is_archived)
                    AND public.runly_note_user_access(par.id, ${userId}::uuid, false)
                )
              )
            END
          )
      )
      SELECT
        a.*,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id',    nt.id,
              'name',  nt.name,
              'color', nt.color
            )
          ) FILTER (WHERE nt.id IS NOT NULL),
          '[]'
        ) AS tags
      FROM accessible a
      LEFT JOIN note_tag_assignments nta
        ON nta.note_id = a.id
      LEFT JOIN note_tags nt
        ON nt.id = nta.tag_id
        AND nt.company_id IS NOT DISTINCT FROM a.company_id
      WHERE (
        ${folderId ?? null}::uuid IS NULL
        OR a.folder_id = ${folderId ?? null}::uuid
      )
      AND (
        ${tagId ?? null}::uuid IS NULL
        OR EXISTS (
          SELECT 1 FROM note_tag_assignments x
          JOIN note_tags scoped_tag ON scoped_tag.id = x.tag_id
            AND scoped_tag.company_id IS NOT DISTINCT FROM a.company_id
          WHERE x.note_id = a.id
            AND x.tag_id = ${tagId ?? null}::uuid
        )
      )
      AND (
        ${q ?? null}::text IS NULL
        -- 'spanish' config must match notes_fts_idx so the GIN index is used.
        OR to_tsvector('spanish', COALESCE(a.title, '') || ' ' || COALESCE(a.content_text, ''))
           @@ plainto_tsquery('spanish', ${q ?? null}::text)
        OR EXISTS (
          SELECT 1 FROM note_tag_assignments nta_q
          JOIN note_tags nt_q ON nt_q.id = nta_q.tag_id
            AND nt_q.company_id IS NOT DISTINCT FROM a.company_id
          WHERE nta_q.note_id = a.id
            AND nt_q.name ILIKE '%' || ${q ?? null}::text || '%'
        )
        OR EXISTS (
          SELECT 1 FROM note_folders nf_q
          WHERE nf_q.id = a.folder_id
            AND nf_q.company_id IS NOT DISTINCT FROM a.company_id
            AND nf_q.name ILIKE '%' || ${q ?? null}::text || '%'
        )
      )
      AND (
        ${shared ?? null}::boolean IS NULL
        OR (
          ${shared ?? null}::boolean = TRUE AND a.is_owner = FALSE
        )
        OR (
          ${shared ?? null}::boolean = FALSE AND a.is_owner = TRUE
        )
      )
      GROUP BY
        a.id,
        a.owner_user_id,
        a.note_type,
        a.company_id,
        a.folder_id,
        a.parent_note_id,
        a.child_count,
        a.title,
        a.content,
        a.content_text,
        a.cover_url,
        a.icon,
        a.background_color,
        a.background_image_url,
        a.paper_style,
        a.paper_margin,
        a.paper_texture,
        a.paper_shadow,
        a.show_public_collaborators,
        a.is_pinned,
        a.is_archived,
        a.is_trashed,
        a.is_public,
        a.public_slug,
        a.word_count,
        a.deleted_at,
        a.trashed_at,
        a.created_at,
        a.updated_at,
        a.is_owner,
        a.my_share_permission
      ORDER BY a.is_pinned DESC, a.updated_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `;

    return rows;
  }

  // ------------------------------------------------------------------
  // Update
  // ------------------------------------------------------------------

  async function updateNote(noteId, userId, data) {
    const access = await assertAccess(noteId, userId, "edit");
    if (data.folderId !== undefined) {
      if (!access.isOwner) throw new NotesServiceError("Solo el propietario puede mover la nota.", 403);
      await folders.assertFolder({ folderId: data.folderId, userId, companyId: access.companyId });
    }
    if (data.showPublicCollaborators !== undefined && typeof data.showPublicCollaborators !== 'boolean') {
      throw new NotesServiceError('Mostrar colaboradores debe ser verdadero o falso.', 400);
    }

    // Opening a note re-sends the same content/title (editor normalization,
    // autosave flush); that must not bump updated_at and reorder "Recientes".
    const [current] = await prisma.$queryRaw`SELECT * FROM notes WHERE id = ${noteId} LIMIT 1`;
    const changed = current ? hasNoteChanges(current, data) : true;

    const rows = await prisma.$queryRaw`
      UPDATE notes
      SET
        title                = CASE
                                 WHEN ${data.title !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.title ?? ''}::text
                                 ELSE title
                               END,
        content              = CASE
                                 WHEN ${data.content !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${JSON.stringify(data.content ?? '')}::jsonb
                                 ELSE content
                               END,
        content_text         = CASE
                                 WHEN ${data.contentText !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.contentText ?? ''}::text
                                 ELSE content_text
                               END,
        icon                 = CASE
                                 WHEN ${data.icon !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.icon ?? ''}::text
                                 ELSE icon
                               END,
        background_color     = CASE
                                 WHEN ${data.backgroundColor !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.backgroundColor ?? null}::text
                                 ELSE background_color
                               END,
        background_image_url = CASE
                                 WHEN ${data.backgroundImageUrl !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.backgroundImageUrl ?? null}::text
                                 ELSE background_image_url
                               END,
        paper_style          = CASE
                                 WHEN ${data.paperStyle !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.paperStyle ?? 'none'}::text
                                 ELSE paper_style
                               END,
        paper_margin         = CASE
                                 WHEN ${data.paperMargin !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.paperMargin ?? false}::boolean
                                 ELSE paper_margin
                               END,
        paper_texture        = CASE
                                 WHEN ${data.paperTexture !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.paperTexture ?? false}::boolean
                                 ELSE paper_texture
                               END,
        paper_shadow         = CASE
                                 WHEN ${data.paperShadow !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.paperShadow ?? false}::boolean
                                 ELSE paper_shadow
                               END,
        show_public_collaborators = CASE
                                 WHEN ${data.showPublicCollaborators !== undefined}::boolean
                                 THEN ${data.showPublicCollaborators ?? true}::boolean
                                 ELSE show_public_collaborators
                               END,
        cover_url            = CASE
                                 WHEN ${data.coverUrl !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.coverUrl ?? null}::text
                                 ELSE cover_url
                               END,
        folder_id            = CASE
                                 WHEN ${data.folderId !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.folderId ?? null}::uuid
                                 ELSE folder_id
                               END,
        is_pinned            = CASE
                                 WHEN ${data.isPinned !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.isPinned ?? null}::boolean
                                 ELSE is_pinned
                               END,
        is_archived          = CASE
                                 WHEN ${data.isArchived !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.isArchived ?? null}::boolean
                                 ELSE is_archived
                               END,
        word_count           = CASE
                                 WHEN ${data.wordCount !== undefined ? "t" : "f"}::boolean = TRUE
                                 THEN ${data.wordCount ?? null}::integer
                                 ELSE word_count
                               END,
        updated_at           = CASE WHEN ${changed}::boolean THEN NOW() ELSE updated_at END
      WHERE id = ${noteId}
        AND deleted_at IS NULL
      RETURNING *
    `;

    if (!rows.length) {
      throw new NotesServiceError("Nota no encontrada.", 404);
    }
    if (!changed) return rows[0];

    // Archiving a page archives its sub-pages too (owner's descendants only,
    // same company); un-archiving restores every archived descendant.
    if (access.isOwner && shouldCascadeArchive(current, data)) {
      await prisma.$executeRaw`
        WITH RECURSIVE tree AS (
          SELECT c.id FROM notes c
          WHERE c.parent_note_id = ${noteId}::uuid
            AND c.deleted_at IS NULL
            AND c.owner_user_id = ${rows[0].owner_user_id}::uuid
            AND c.company_id IS NOT DISTINCT FROM ${rows[0].company_id ?? null}::uuid
          UNION ALL
          SELECT c.id FROM notes c JOIN tree t ON c.parent_note_id = t.id
          WHERE c.deleted_at IS NULL
            AND c.owner_user_id = ${rows[0].owner_user_id}::uuid
            AND c.company_id IS NOT DISTINCT FROM ${rows[0].company_id ?? null}::uuid
        )
        UPDATE notes
        SET is_archived = ${data.isArchived}::boolean, updated_at = NOW()
        WHERE id IN (SELECT id FROM tree)
          AND is_archived IS DISTINCT FROM ${data.isArchived}::boolean
      `;
    }

    // Keep the backlinks index in sync; a failure here must never fail the save.
    if (typeof data.content === "string") {
      try {
        await references.syncReferences({ noteId, companyId: rows[0].company_id, html: data.content });
      } catch (syncErr) {
        console.warn('[notes] reference sync failed after updateNote:', syncErr?.message ?? syncErr);
      }
    }

    // Broadcast to every collaborator so metadata (cover, icon, background,
    // title, folder...) shows up live for them — the note body syncs through
    // its own Y.js channel, but these columns only move on a refetch. Include
    // the OWNER (a guest's edit must reach them too) and drop the actor.
    if (broadcaster) {
      try {
        const shareRows = await prisma.$queryRaw`
          SELECT shared_with_user_id
          FROM note_shares
          WHERE note_id = ${noteId}
        `;
        const recipientIds = [
          ...shareRows.map((r) => r.shared_with_user_id.toString()),
          rows[0].owner_user_id?.toString(),
        ].filter((id) => id && id !== String(userId));
        if (recipientIds.length > 0) {
          await broadcaster.broadcastToUsers(
            [...new Set(recipientIds)],
            "notes.note.updated",
            { noteId },
          );
        }
      } catch (broadcastErr) {
        console.warn('[notes] broadcast failed after updateNote:', broadcastErr?.message ?? broadcastErr)
      }
    }

    return rows[0];
  }

  // ------------------------------------------------------------------
  // Append (MCP / MirAI): adds blocks at the END of a note, never replaces.
  // ------------------------------------------------------------------

  // The body lives in the content/content_text columns AND, once the note was
  // opened in the editor, in a Y.js snapshot the editor prefers. With a
  // snapshot we append the Y.js nodes (merged through ydoc-service's CRDT
  // merge-with-retry) and mirror the same text into the columns; without one
  // the columns are the only source (the editor seeds from HTML on first open).
  async function appendToNote({ noteId, userId, companyId, text }) {
    const value = String(text ?? "");
    if (!value.trim()) throw new NotesServiceError("No hay texto que agregar.", 400);
    if (value.length > MAX_APPEND_CHARS) throw new NotesServiceError(`El texto excede ${MAX_APPEND_CHARS} caracteres.`, 400);
    const blocks = parseAppendText(value);
    if (!blocks.length) throw new NotesServiceError("No hay texto que agregar.", 400);

    const access = await assertAccess(noteId, userId, "edit");
    if (companyId && access.companyId && access.companyId !== companyId) {
      throw new NotesServiceError("Nota no encontrada.", 404);
    }
    const [note] = await prisma.$queryRaw`
      SELECT content, content_text, word_count, is_trashed, note_type FROM notes
      WHERE id = ${noteId}::uuid AND deleted_at IS NULL LIMIT 1
    `;
    if (!note) throw new NotesServiceError("Nota no encontrada.", 404);
    if (note.is_trashed) throw new NotesServiceError("La nota esta en la papelera.", 422);
    if (note.note_type === "canvas") throw new NotesServiceError("No se puede agregar texto a un lienzo.", 422);

    let yUpdate = null;
    const [stateRow] = await prisma.$queryRaw`SELECT state FROM note_ydoc_state WHERE note_id = ${noteId}::uuid`;
    if (stateRow) {
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, new Uint8Array(stateRow.state));
        const before = Y.encodeStateVector(doc);
        appendBlocksToYDoc(doc, blocks);
        yUpdate = Y.encodeStateAsUpdate(doc, before);
      } finally {
        doc.destroy();
      }
      await createYDocService({ prisma }).saveState(noteId, userId, Buffer.from(yUpdate).toString("base64"));
    }

    const html = blocksToHtml(blocks);
    const plain = blocksToPlainText(blocks);
    const currentHtml = typeof note.content === "string" ? note.content : "";
    const currentText = note.content_text ?? "";
    const added = plain.split(/\s+/).filter(Boolean).length;
    const updated = await updateNote(noteId, userId, {
      content: currentHtml + html,
      contentText: currentText ? `${currentText}\n${plain}` : plain,
      wordCount: (note.word_count ?? 0) + added,
    });

    // Best effort live delivery to editors that already have the note open.
    if (yUpdate && broadcaster?.broadcastToChannel) {
      try {
        await broadcaster.broadcastToChannel(`note:ydoc:${noteId}`, "ydoc.update", { update: Buffer.from(yUpdate).toString("base64") });
      } catch (err) {
        console.warn("[notes] ydoc broadcast failed after appendToNote:", err?.message ?? err);
      }
    }
    return { id: noteId, title: updated.title, appended: blocks.length, ydoc: Boolean(yUpdate) };
  }

  // ------------------------------------------------------------------
  // Trash / Restore / Permanent delete
  // ------------------------------------------------------------------

  async function trashNote(noteId, userId) {
    const rows = await prisma.$queryRaw`
      SELECT id, owner_user_id
      FROM notes
      WHERE id = ${noteId}
        AND deleted_at IS NULL
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotesServiceError("Nota no encontrada.", 404);
    }
    if (rows[0].owner_user_id !== userId) {
      throw new NotesServiceError("Solo el propietario puede mover esta nota a la papelera.", 403);
    }

    // The note and its sub-pages go to the trash together (same trashed_at, so
    // restore can tell them apart from pages trashed on their own earlier).
    await prisma.$executeRaw`
      WITH RECURSIVE tree AS (
        SELECT id FROM notes WHERE id = ${noteId}::uuid
        UNION ALL
        SELECT n.id FROM notes n JOIN tree t ON n.parent_note_id = t.id WHERE n.deleted_at IS NULL
      )
      UPDATE notes
      SET is_trashed = TRUE,
          trashed_at = NOW(),
          updated_at = NOW()
      WHERE id IN (SELECT id FROM tree)
        AND deleted_at IS NULL
        AND (is_trashed = FALSE OR id = ${noteId}::uuid)
    `;

    return { ok: true };
  }

  async function restoreNote(noteId, userId) {
    const rows = await prisma.$queryRaw`
      SELECT id, owner_user_id
      FROM notes
      WHERE id = ${noteId}
        AND deleted_at IS NULL
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotesServiceError("Nota no encontrada.", 404);
    }
    if (rows[0].owner_user_id !== userId) {
      throw new NotesServiceError("Solo el propietario puede restaurar esta nota.", 403);
    }

    // Brings back the note plus only the sub-pages trashed with it.
    await prisma.$executeRaw`
      WITH RECURSIVE tree AS (
        SELECT id FROM notes WHERE id = ${noteId}::uuid
        UNION ALL
        SELECT n.id FROM notes n JOIN tree t ON n.parent_note_id = t.id
        WHERE n.deleted_at IS NULL
          AND n.is_trashed = TRUE
          AND n.trashed_at = (SELECT trashed_at FROM notes WHERE id = ${noteId}::uuid)
      )
      UPDATE notes
      SET is_trashed = FALSE,
          trashed_at = NULL,
          updated_at = NOW()
      WHERE id IN (SELECT id FROM tree)
        AND deleted_at IS NULL
    `;

    return { ok: true };
  }

  async function permanentDelete(noteId, userId) {
    const rows = await prisma.$queryRaw`
      SELECT id, owner_user_id, is_trashed
      FROM notes
      WHERE id = ${noteId}
        AND deleted_at IS NULL
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotesServiceError("Nota no encontrada.", 404);
    }
    if (rows[0].owner_user_id !== userId) {
      throw new NotesServiceError("Solo el propietario puede eliminar esta nota.", 403);
    }
    if (!rows[0].is_trashed) {
      throw new NotesServiceError("La nota debe estar en la papelera antes de eliminarla permanentemente.", 400);
    }

    await prisma.$executeRaw`
      DELETE FROM notes
      WHERE id = ${noteId}
        AND deleted_at IS NULL
    `;

    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  return {
    assertAccess,
    createNote,
    getNote,
    listNotes,
    updateNote,
    appendToNote,
    trashNote,
    restoreNote,
    permanentDelete,
  };
}
