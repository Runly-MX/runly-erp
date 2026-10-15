// Folder tree + folder public links for runly.files (authenticated). The
// anonymous side lives in files-public.js (GET /public/folders/:token).
import { Hono } from "hono";
import { z } from "zod";
import { fileShareLinkCreateSchema } from "@runly/validators";
import { createFilesFolders } from "../services/files/folders.js";
import { FileAccessError } from "../services/files/access.js";
import { FilesServiceError } from "../services/files-service.js";
import { tenantActiveContext } from "../lib/active-context.js";

export function createFilesFoldersRouter({ prisma, filesService, authMiddleware, requirePermission }) {
  const app = new Hono();
  const service = createFilesFolders({ prisma, filesService });
  const id = z.uuid();
  const scope = z.enum(["PRIVATE", "COMPANY"]);
  const createSchema = z.strictObject({ name: z.string().min(1).max(120), parentId: id.nullable().optional(), scope: scope.optional() });
  const updateSchema = z.strictObject({ name: z.string().min(1).max(120).optional(), scope: scope.optional(), parentId: id.nullable().optional() });
  const moveSchema = z.strictObject({ fileIds: z.array(id).min(1).max(200), folderId: id.nullable() });
  const auth = [authMiddleware, requirePermission("files.assets.read")];

  const handle = (fallback, run, status = 200) => async (c) => {
    try {
      const base = { authUserId: c.get("authUserId"), activeContext: tenantActiveContext(c) };
      return c.json({ data: await run(c, base) }, status);
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: "Solicitud inválida." }, 400);
      if (error instanceof FilesServiceError || error instanceof FileAccessError) return c.json({ error: error.message }, error.status);
      console.error("[runly.files] folders route error", error);
      return c.json({ error: fallback }, 500);
    }
  };

  app.get("/files/folders", ...auth, handle("No se pudieron cargar las carpetas.", (c, base) => service.tree(base)));
  app.post("/files/folders", ...auth, handle("No se pudo crear la carpeta.", async (c, base) => service.create({ ...base, ...createSchema.parse(await c.req.json()) }), 201));
  app.post("/files/folders/move-files", ...auth, handle("No se pudieron mover los archivos.", async (c, base) => service.moveFiles({ ...base, ...moveSchema.parse(await c.req.json()) })));
  app.patch("/files/folders/:id", ...auth, handle("No se pudo actualizar la carpeta.", async (c, base) => service.update({ ...base, id: id.parse(c.req.param("id")), ...updateSchema.parse(await c.req.json()) })));
  app.delete("/files/folders/:id", ...auth, handle("No se pudo eliminar la carpeta.", (c, base) => service.remove({ ...base, id: id.parse(c.req.param("id")) })));
  app.get("/files/folders/:id/links", ...auth, handle("No se pudieron cargar los enlaces.", (c, base) => service.listLinks({ ...base, folderId: id.parse(c.req.param("id")) })));
  app.post("/files/folders/:id/links", ...auth, handle("No se pudo crear el enlace.", async (c, base) =>
    service.createLink({ ...base, folderId: id.parse(c.req.param("id")), input: fileShareLinkCreateSchema.parse(await c.req.json().catch(() => ({}))) }), 201));
  app.post("/files/folders/:id/links/:linkId/revoke", ...auth, handle("No se pudo revocar el enlace.", (c, base) =>
    service.revokeLink({ ...base, folderId: id.parse(c.req.param("id")), linkId: id.parse(c.req.param("linkId")) })));
  return app;
}
