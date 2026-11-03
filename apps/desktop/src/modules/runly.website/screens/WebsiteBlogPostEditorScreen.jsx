import { companyFetch } from '../../../lib/companyFetch.js'
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoadingState } from "@runly/ui";
import {
  AtlasWebBuilderEditor,
  baseBlocks,
  serializePage,
  parsePage,
  defaultTheme,
  defineTheme,
} from "@raulbellosom/atlas-web-builder";
import "@raulbellosom/atlas-web-builder/styles";
import "../../../website/runlySite.css";
import { ArrowLeft } from "lucide-react";
import { sitePath } from "../lib/pageRoute.js";
import { newIdempotencyKey } from "../lib/websiteApi.js";
import { useSiteContext, usePages, useWebsiteCapabilities } from "../hooks/useWebsite.js";
import { CapabilityButton } from "../components/CapabilityButton.jsx";
import { PublishSheet } from "../components/PublishSheet.jsx";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { getApiUrl } from "../../../lib/runtimeConfig.js";
import { toast } from "sonner";

async function apiFetch(path, token, options = {}) {
  const res = await companyFetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function createAssetSource(token) {
  const apiUrl = getApiUrl();
  return {
    async list() {
      try {
        // Only PUBLIC images: private signed URLs expire on a published post.
        const data = await apiFetch("/files?pageSize=100&visibility=PUBLIC&mime=image/", token);
        const files = (data.data ?? []).filter((f) =>
          f.mimeType?.startsWith("image/"),
        );
        if (!files.length) return [];
        const urlRes = await apiFetch("/files/batch-signed-urls", token, {
          method: "POST",
          body: JSON.stringify({ fileIds: files.map((f) => f.id) }),
        });
        const urlMap = urlRes.data ?? {};
        return files
          .filter((f) => urlMap[f.id])
          .map((f) => ({
            id: f.id,
            name: f.originalName ?? f.id,
            kind: "image",
            url: urlMap[f.id],
          }));
      } catch {
        return [];
      }
    },
    async upload(file) {
      const form = new FormData();
      form.append("file", file);
      form.append("visibility", "PUBLIC");
      form.append("moduleKey", "runly.website");
      const res = await companyFetch(`${apiUrl}/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const f = data.data;
      return {
        id: f.id,
        name: f.originalName ?? f.id,
        kind: "image",
        url: f.url ?? "",
      };
    },
    async remove(id) {
      await apiFetch(`/files/${id}`, token, { method: "DELETE" });
    },
  };
}

// siteId/postId arrive from /sites/:siteId/blog/:postId; the historical
// /blog/:id/editor route still resolves the post from the URL.
export default function WebsiteBlogPostEditorScreen({ siteId: siteIdProp = null, postId: postIdProp = null }) {
  const { "*": wildcard } = useParams();
  const navigate = useNavigate();
  const postId = postIdProp ?? wildcard?.match(/^blog\/([^/]+)\/editor$/)?.[1] ?? null;
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const { site, release } = useSiteContext(siteIdProp);
  const sitePages = usePages(siteIdProp);
  const caps = useWebsiteCapabilities(siteIdProp);
  const [publishOpen, setPublishOpen] = useState(false);

  // GET /website/blog/posts/:id answers the post itself (not wrapped in `data`).
  const postQuery = useQuery({
    queryKey: ["blog-post", postId, token],
    queryFn: () => apiFetch(`/website/blog/posts/${postId}`, token),
    enabled: Boolean(token) && Boolean(postId),
  });
  const postData = postQuery.data?.data ?? postQuery.data ?? null;
  const revisionRef = useRef(null);
  if (postData && revisionRef.current === null) revisionRef.current = postData.revision ?? 0;

  const themeQuery = useQuery({
    queryKey: ["website-theme", postData?.siteId ?? null, token],
    queryFn: () => apiFetch(`/website/theme?siteId=${postData.siteId}`, token),
    enabled: Boolean(token) && Boolean(postData?.siteId),
    staleTime: 60_000,
  });

  const onSaveError = (err) => toast.error(/revision|Revisi/i.test(err.message) ? "La entrada cambió en otro lugar. Recarga la página para ver la versión actual." : err.message);

  // Revisioned draft (contract S2/S3): POST .../save-draft with expectedRevision.
  const saveDraftMutation = useMutation({
    mutationFn: (page) =>
      apiFetch(`/website/blog/posts/${postId}/save-draft`, token, {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ builderData: JSON.parse(serializePage(page)), expectedRevision: revisionRef.current ?? 0 }),
      }),
    onSuccess: (saved) => {
      revisionRef.current = saved?.revision ?? revisionRef.current;
      toast.success("Borrador guardado");
    },
    onError: onSaveError,
  });

  const publishMutation = useMutation({
    mutationFn: (page) =>
      apiFetch(`/website/blog/posts/${postId}/publish`, token, {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ builderData: JSON.parse(serializePage(page)), expectedRevision: revisionRef.current ?? 0 }),
      }),
    onSuccess: (saved) => {
      revisionRef.current = saved?.revision ?? revisionRef.current;
      queryClient.invalidateQueries({ queryKey: ["blog-posts"] });
      toast.success("Entrada publicada");
    },
    onError: onSaveError,
  });

  const themeData = themeQuery.data?.data ?? null;

  const resolvedTheme = themeData?.tokens
    ? defineTheme({
        ...defaultTheme,
        id: "atlas-site",
        name: "Site Theme",
        tokens: { ...defaultTheme.tokens, ...themeData.tokens },
      })
    : defaultTheme;

  let initialPage = null;
  const storedDraft = postData?.draftBuilderData ?? postData?.draft_builder_data;
  if (storedDraft && Object.keys(storedDraft).length) {
    try {
      initialPage =
        typeof storedDraft === "string"
          ? parsePage(storedDraft)
          : parsePage(JSON.stringify(storedDraft));
    } catch {
      initialPage = null;
    }
  }

  if (!initialPage && postData) {
    initialPage = {
      schemaVersion: 1,
      id: `blog_${postData.id}`,
      slug: postData.slug ?? "/blog/nueva-entrada",
      title: postData.title ?? "Nueva entrada",
      visibility: "public",
      regions: { main: { id: "region_main", children: [] } },
      blocks: {},
      seo: {
        title: postData.title ?? "",
        description: postData.excerpt ?? "",
        canonical: null,
        ogImageAssetId: null,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  if (postQuery.isPending || !initialPage) {
    return <LoadingState variant="page" message="Cargando editor..." />;
  }

  const scoped = Boolean(siteIdProp);
  return (
    <div
      className={scoped ? "fixed inset-x-0 bottom-0 z-40 flex flex-col bg-[hsl(var(--background))]" : undefined}
      style={scoped ? { top: "calc(var(--topbar-height, 3.5rem) + var(--sat, 0px))" } : { position: "fixed", inset: 0 }}
      data-testid="website-blog-editor"
    >
      {scoped && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[hsl(var(--border))] px-3 py-2 md:px-4">
          <button type="button" className="inline-flex items-center gap-1 text-sm hover:underline" onClick={() => navigate(sitePath(siteIdProp, "blog"))}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Blog
          </button>
          <p className="min-w-0 truncate text-sm font-semibold">{postData?.title ?? "Entrada"}</p>
          <p className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:block">Guarda el borrador y elige la entrada al publicar el sitio.</p>
          <CapabilityButton capability={caps.publish} size="sm" className="ml-auto" onClick={() => setPublishOpen(true)}>Publicar lo guardado</CapabilityButton>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
      <AtlasWebBuilderEditor
        blocks={baseBlocks}
        initialPage={initialPage}
        theme={resolvedTheme}
        assets={createAssetSource(token)}
        brandName="Runly ERP"
        onSaveDraft={(page) => saveDraftMutation.mutate(page)}
        onPublish={(page) => (scoped ? saveDraftMutation.mutate(page) : publishMutation.mutate(page))}
      />
      </div>
      {scoped && site.data && (
        <PublishSheet open={publishOpen} onOpenChange={setPublishOpen} site={site.data} pages={sitePages.data ?? []} activeRelease={release.data ?? null} />
      )}
    </div>
  );
}
