// Public file links: GET /public/files/:token (no auth). Each request counts
// as one use, returns short-lived signed URLs and, in "view" mode, no download
// URL. Path-scoped only; never add a root use('*') (see the load-bearing note
// next to the chat/calls routers in index.js).
import { Hono } from "hono";
import { createTokenBucketLimiter } from "../lib/token-bucket-limiter.js";
import { linkStatus } from "../services/module-public-links-service.js";
import { FILES_LINK_MODULE, FILE_LINK_RESOURCE } from "../services/files/public-links.js";
import { FOLDER_LINK_RESOURCE } from "../services/files/folders.js";

const PUBLIC_URL_SECONDS = 300;
const WEBSITE_BUCKET_NAME = "runly-website";
const FOLDER_PAGE_FILES = 200;

function clientIp(c) {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return c.req.header("x-real-ip") ?? "local";
}

export function createFilesPublicRouter({
  prisma,
  supabaseAdmin,
  resolveLogoUrl = async () => null,
  limiter = createTokenBucketLimiter({ capacity: 30, refillPerSecond: 0.5 }),
}) {
  const app = new Hono();
  const unavailable = (c, status = 404, reason = null) => c.json({ error: "Enlace no disponible", ...(reason ? { reason } : {}) }, status);

  async function sign(file, download) {
    const storage = supabaseAdmin.storage.from(file.bucket);
    if (file.bucket === WEBSITE_BUCKET_NAME && !download) return storage.getPublicUrl(file.objectKey)?.data?.publicUrl ?? null;
    const { data } = await storage.createSignedUrl(file.objectKey, PUBLIC_URL_SECONDS, download ? { download: file.originalName } : undefined);
    return data?.signedUrl ?? null;
  }

  app.get("/public/files/:token", async (c) => {
    const token = c.req.param("token");
    const rate = limiter.consume(`${clientIp(c)}:${token}`);
    if (!rate.allowed) {
      c.header("Retry-After", String(rate.retryAfter));
      return c.json({ error: "Demasiadas solicitudes. Intenta más tarde." }, 429);
    }
    if (typeof token !== "string" || token.length < 20 || token.length > 100) return unavailable(c);
    const link = await prisma.modulePublicLink.findUnique({ where: { token } });
    if (!link || link.moduleKey !== FILES_LINK_MODULE || link.resourceKey !== FILE_LINK_RESOURCE || !link.recordId) return unavailable(c);
    const status = linkStatus(link);
    if (status !== "activo") return unavailable(c, 410, status);
    const file = await prisma.fileAsset.findFirst({ where: { id: link.recordId, entityId: link.companyId, enabled: true } });
    if (!file) return unavailable(c, 410, "no_disponible");
    const counted = await prisma.$queryRaw`
      UPDATE module_public_link SET use_count = use_count + 1, last_used_at = now(), updated_at = now()
       WHERE id = ${link.id}::uuid AND revoked_at IS NULL AND (max_uses IS NULL OR use_count < max_uses)
      RETURNING id`;
    if (!counted.length) return unavailable(c, 410, "agotado");
    const canDownload = link.mode === "download";
    const [previewUrl, downloadUrl, company] = await Promise.all([
      sign(file, false),
      canDownload ? sign(file, true) : null,
      prisma.company.findUnique({ where: { id: link.companyId }, select: { name: true, brandingConfig: { select: { logoFileId: true } } } }),
    ]);
    return c.json({
      data: {
        name: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, mode: link.mode,
        previewUrl, downloadUrl, expiresAt: link.expiresAt,
        company: { name: company?.name ?? "", logoUrl: await resolveLogoUrl(company?.brandingConfig?.logoFileId ?? null).catch(() => null) },
      },
    });
  });

  // Public folder: GET /public/folders/:token[?folder=<subfolderId>]. Opening
  // the link (no `folder`) counts as one use; navigating inside it does not.
  // The link exposes the enabled files of the folder's whole subtree.
  app.get("/public/folders/:token", async (c) => {
    const token = c.req.param("token");
    const rate = limiter.consume(`${clientIp(c)}:${token}`);
    if (!rate.allowed) {
      c.header("Retry-After", String(rate.retryAfter));
      return c.json({ error: "Demasiadas solicitudes. Intenta más tarde." }, 429);
    }
    if (typeof token !== "string" || token.length < 20 || token.length > 100) return unavailable(c);
    const link = await prisma.modulePublicLink.findUnique({ where: { token } });
    if (!link || link.moduleKey !== FILES_LINK_MODULE || link.resourceKey !== FOLDER_LINK_RESOURCE || !link.recordId) return unavailable(c);
    const status = linkStatus(link);
    if (status !== "activo") return unavailable(c, 410, status);

    const all = await prisma.fileFolder.findMany({ where: { companyId: link.companyId }, select: { id: true, parentId: true, name: true } });
    const byId = new Map(all.map((f) => [f.id, f]));
    const root = byId.get(link.recordId);
    if (!root) return unavailable(c, 410, "no_disponible");

    const requested = c.req.query("folder") || null;
    let current = root;
    if (requested && requested !== root.id) {
      const target = byId.get(requested);
      // The requested folder must sit inside the shared one.
      const trail = [];
      for (let cursor = target; cursor && trail.length < 12; cursor = cursor.parentId ? byId.get(cursor.parentId) : null) trail.push(cursor.id);
      if (!target || !trail.includes(root.id)) return unavailable(c, 404);
      current = target;
    }
    if (!requested) {
      const counted = await prisma.$queryRaw`
        UPDATE module_public_link SET use_count = use_count + 1, last_used_at = now(), updated_at = now()
         WHERE id = ${link.id}::uuid AND revoked_at IS NULL AND (max_uses IS NULL OR use_count < max_uses)
        RETURNING id`;
      if (!counted.length) return unavailable(c, 410, "agotado");
    }

    const breadcrumbs = [];
    for (let cursor = current; cursor && breadcrumbs.length < 12; cursor = cursor.id === root.id ? null : byId.get(cursor.parentId)) {
      breadcrumbs.unshift({ id: cursor.id, name: cursor.name, isRoot: cursor.id === root.id });
    }
    const files = await prisma.fileAsset.findMany({
      where: { folderId: current.id, entityId: link.companyId, enabled: true },
      orderBy: { originalName: "asc" },
      take: FOLDER_PAGE_FILES,
    });
    const canDownload = link.mode === "download";
    const signed = await Promise.all(files.map(async (file) => ({
      id: file.id, name: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, updatedAt: file.updatedAt,
      previewUrl: await sign(file, false).catch(() => null),
      downloadUrl: canDownload ? await sign(file, true).catch(() => null) : null,
    })));
    const company = await prisma.company.findUnique({ where: { id: link.companyId }, select: { name: true, brandingConfig: { select: { logoFileId: true } } } });
    return c.json({
      data: {
        name: current.name, mode: link.mode, expiresAt: link.expiresAt, breadcrumbs,
        folders: all.filter((f) => f.parentId === current.id).sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ id: f.id, name: f.name })),
        files: signed,
        company: { name: company?.name ?? "", logoUrl: await resolveLogoUrl(company?.brandingConfig?.logoFileId ?? null).catch(() => null) },
      },
    });
  });

  return app;
}
