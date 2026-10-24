// apps/api/src/routes/notes/mirai-capabilities.js
//
// runly.notes capability for MirAI (spec 2026-09-30-mirai-remaining-modules
// §3). publicLookup: not applicable — notes are private user content with no
// public-internet counterpart.
import { createSupabaseAdminClient } from "../../services/supabase-admin.js";
import { createNotesService } from "./notes-service.js";
import { createFoldersService } from "./folders-service.js";
import { createTagsService } from "./tags-service.js";
import { createNotesMiraiQueries } from "./notes-mirai-queries.js";
import { createNotesMiraiActions } from "./mirai-actions.js";

export function createNotesMiraiCapabilities({ prisma, broadcaster = null, supabaseAdmin = createSupabaseAdminClient() }) {
  const notesSvc = createNotesService({ prisma, broadcaster, supabaseAdmin });
  const foldersSvc = createFoldersService({ prisma });
  const tagsSvc = createTagsService({ prisma });

  return {
    moduleKey: "runly.notes",
    label: "Notas",
    summary: "Notas del usuario: busqueda por texto/etiqueta/carpeta, contenido; crear, agregar texto al final de una nota existente (notes.note.append: anexa, nunca reemplaza; tambien puede adjuntar hasta 5 imagenes por enlace https publico (preferido) o base64), renombrar/mover y eliminar. Las subpaginas son notas normales anidadas (parent_note_id); la busqueda las devuelve indicando su pagina padre.",
    tools: createNotesMiraiQueries({ prisma, notesSvc }),
    actions: createNotesMiraiActions({ prisma, notesSvc, foldersSvc, tagsSvc }),
    publicLookup: [],
    async describeContext(pageContext, actx) {
      if (pageContext?.recordType !== "note" || !pageContext.recordId) return null;
      const note = await notesSvc.getNote(String(pageContext.recordId), actx.actorProfileId).catch(() => null);
      if (!note) return null;
      return `El usuario esta viendo la nota "${note.title || "(sin titulo)"}" (noteId ${note.id}).`;
    },
  };
}
