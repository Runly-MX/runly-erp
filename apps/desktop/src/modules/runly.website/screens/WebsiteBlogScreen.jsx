import { companyFetch } from '../../../lib/companyFetch.js'
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { getApiUrl } from "../../../lib/runtimeConfig.js";
import { Button, EmptyState, ConfirmDialog, SelectField, LoadingState } from "@runly/ui";
import { Newspaper, PenLine, Plus } from "lucide-react";
import { toast } from "sonner";
import { useScopedSite } from "../hooks/useScopedSite.js";
import { postEditorPath } from "../lib/pageRoute.js";
import WebsiteNewBlogPostDialog from "./WebsiteNewBlogPostDialog.jsx";
import { SiteSectionHeader } from "../components/SiteSectionHeader.jsx";
import { BlogPostList } from "../components/BlogPostList.jsx";

async function apiGet(path, token) {
  const res = await companyFetch(`${getApiUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function WebsiteBlogScreen({ siteId: siteIdProp = null }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const siteQuery = useScopedSite(siteIdProp);
  const siteId = siteQuery.data?.data?.id ?? null;

  const catsQuery = useQuery({
    queryKey: ["blog-categories", siteId, token],
    queryFn: () => apiGet(`/website/blog/categories?siteId=${siteId}`, token),
    enabled: Boolean(token) && Boolean(siteId),
    staleTime: 60_000,
  });
  const categories = catsQuery.data?.data ?? [];

  const postsQuery = useQuery({
    queryKey: ["blog-posts", siteId, categoryFilter, token],
    queryFn: () =>
      apiGet(
        `/website/blog/posts?siteId=${siteId}${categoryFilter ? `&categoryId=${categoryFilter}` : ""}`,
        token,
      ),
    enabled: Boolean(token) && Boolean(siteId),
    staleTime: 30_000,
  });
  const posts = postsQuery.data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (postId) => {
      const res = await companyFetch(`${getApiUrl()}/website/blog/posts/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(res.status === 409 ? "Este sitio publica por versiones: la entrada no se puede eliminar desde aquí todavía." : (body.error ?? `HTTP ${res.status}`));
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Entrada eliminada");
      queryClient.invalidateQueries({ queryKey: ["blog-posts", siteId] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error.message || "Error al eliminar la entrada");
      setDeleteTarget(null);
    },
  });

  if (siteQuery.isPending) return <LoadingState variant="page" />;

  const publishedCount = posts.filter((post) => post.status === "published").length;
  const draftCount = posts.filter((post) => post.status === "draft").length;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SiteSectionHeader
        icon={Newspaper}
        tone="violet"
        title="Blog"
        description="Escribe y organiza las entradas del blog público de tu sitio."
        actions={
          <Button onClick={() => setDialogOpen(true)} disabled={!siteId}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />Nueva entrada
          </Button>
        }
      />

      {!siteId ? (
        <EmptyState
          icon={Newspaper}
          title="Sitio web no configurado"
          description='Configura tu sitio web primero desde la sección "Sitio web".'
        />
      ) : (
        <>
          {(categories.length > 0 || posts.length > 0) && (
            <div className="flex flex-wrap items-end justify-between gap-3">
              {posts.length > 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  <span className="font-semibold tabular-nums text-[hsl(var(--foreground))]">{posts.length}</span> entrada{posts.length !== 1 ? "s" : ""}
                  {" · "}<span className="tabular-nums">{publishedCount}</span> publicada{publishedCount !== 1 ? "s" : ""}
                  {" · "}<span className="tabular-nums">{draftCount}</span> en borrador
                </p>
              ) : <span />}
              {categories.length > 0 && (
                <div className="w-full sm:w-64">
                  <SelectField
                    label="Categoría"
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    options={[
                      { value: "", label: "Todas las categorías" },
                      ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
                    ]}
                  />
                </div>
              )}
            </div>
          )}

          {postsQuery.isPending ? (
            <LoadingState message="Cargando entradas..." />
          ) : posts.length === 0 ? (
            <EmptyState
              icon={PenLine}
              title={categoryFilter ? "No hay entradas en esta categoría" : "Tu blog está vacío"}
              description={categoryFilter ? "Prueba con otra categoría o crea una entrada nueva." : "Comparte novedades, guías o casos de éxito. Tu primera entrada se guarda como borrador hasta que la publiques."}
              action={{
                label: "Crear primera entrada",
                onClick: () => setDialogOpen(true),
              }}
            />
          ) : (
            <BlogPostList
              posts={posts}
              deleting={deleteMutation.isPending}
              onOpen={(post) => navigate(postEditorPath(siteIdProp, post.id))}
              onDelete={setDeleteTarget}
            />
          )}
        </>
      )}

      <WebsiteNewBlogPostDialog
        siteId={siteId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(post) => {
          queryClient.invalidateQueries({ queryKey: ["blog-posts", siteId] });
          navigate(postEditorPath(siteIdProp, post.id));
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Eliminar entrada"
        description={`Se eliminará permanentemente la entrada "${deleteTarget?.title}". Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(deleteTarget?.id)}
      />
    </div>
  );
}
