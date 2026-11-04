import { companyFetch } from '../../../lib/companyFetch.js'
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { getApiUrl } from "../../../lib/runtimeConfig.js";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
  ChipTabs,
  StatusPill,
  TextField,
  LoadingState,
} from "@runly/ui";
import { CheckCircle2, LayoutTemplate, Paintbrush, Palette, Save, Type } from "lucide-react";
import { SiteSectionHeader } from "../components/SiteSectionHeader.jsx";
import { ThemePicker } from "../components/ThemePicker.jsx";
import { ThemePreviewCard } from "../components/ThemePreviewCard.jsx";
import { createWebsiteApi, newIdempotencyKey } from "../lib/websiteApi.js";
import { useScopedSite } from "../hooks/useScopedSite.js";
import { toast } from "sonner";
import { usePersistedTab } from "../../../hooks/usePersistedTab.js";
import ThemeColorEditor from "./ThemeColorEditor.jsx";
import ThemeTypographyEditor from "./ThemeTypographyEditor.jsx";

const TABS = ["Colores", "Tipografia"];
const TAB_LABELS = { Colores: "Colores", Tipografia: "Tipografía" };
const TAB_ICONS = { Colores: Palette, Tipografia: Type };

async function apiGet(path, token) {
  const res = await companyFetch(`${getApiUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function WebsiteThemeScreen({ siteId: siteIdProp = null }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = usePersistedTab("runly.website.themeTab", TABS, "Colores");
  const [selectedThemeId, setSelectedThemeId] = useState(null);
  const [newThemeOpen, setNewThemeOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [draft, setDraft] = useState({ tokens: {}, typography: {} });
  const [isDirty, setIsDirty] = useState(false);

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const siteQuery = useScopedSite(siteIdProp);
  const siteId = siteQuery.data?.data?.id ?? null;
  const site = siteQuery.data?.data ?? null;

  const themesQuery = useQuery({
    queryKey: ["website-themes", siteId, token],
    queryFn: () => apiGet(`/website/themes?siteId=${siteId}`, token),
    enabled: Boolean(token) && Boolean(siteId),
    staleTime: 30_000,
  });
  const themes = themesQuery.data?.data ?? [];

  const activeThemeId = selectedThemeId ?? themes[0]?.id ?? null;

  const themeDetailQuery = useQuery({
    queryKey: ["website-theme", activeThemeId, token],
    queryFn: () => apiGet(`/website/themes/${activeThemeId}`, token),
    enabled: Boolean(token) && Boolean(activeThemeId),
    staleTime: 30_000,
  });
  const themeDetail = themeDetailQuery.data ?? null;

  useEffect(() => {
    if (themeDetail) {
      setDraft({
        tokens: themeDetail.tokens ?? {},
        typography: themeDetail.typography ?? {},
      });
      setIsDirty(false);
    }
  }, [themeDetail?.id]);

  const createThemeMutation = useMutation({
    mutationFn: async (name) => {
      const res = await companyFetch(`${getApiUrl()}/website/themes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ siteId, name, isDefault: themes.length === 0 }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({}))).error || `HTTP ${res.status}`,
        );
      return res.json();
    },
    onSuccess: (theme) => {
      toast.success("Tema creado");
      queryClient.invalidateQueries({ queryKey: ["website-themes", siteId] });
      setSelectedThemeId(theme.id);
      setNewThemeOpen(false);
      setNewThemeName("");
    },
    onError: (err) => toast.error(err.message || "Error al crear tema"),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await companyFetch(
        `${getApiUrl()}/website/themes/${activeThemeId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            tokens: draft.tokens,
            typography: draft.typography,
          }),
        },
      );
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({}))).error || `HTTP ${res.status}`,
        );
      return res.json();
    },
    onSuccess: () => {
      toast.success("Tema guardado");
      setIsDirty(false);
      queryClient.invalidateQueries({
        queryKey: ["website-theme", activeThemeId],
      });
    },
    onError: (err) => toast.error(err.message || "Error al guardar"),
  });

  // Multisite: the chosen theme goes through the revisioned identity draft and
  // reaches the public site on the next publish. The historical route (no siteId)
  // keeps writing the default site directly.
  const appliedThemeId = siteIdProp ? (site?.draftIdentity?.themeId ?? site?.themeId ?? null) : (site?.themeId ?? null);
  const useSiteThemeMutation = useMutation({
    mutationFn: async () => {
      if (siteIdProp) {
        // Page saves bump the site revision, so the cached site here is usually stale.
        const api = createWebsiteApi(token);
        const fresh = (await api.getSite(siteIdProp)).data;
        return api.saveIdentity(siteIdProp, { themeId: activeThemeId }, fresh.draftRevision, newIdempotencyKey());
      }
      const res = await companyFetch(`${getApiUrl()}/website/site/${site.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ themeId: activeThemeId }),
      });
      if (!res.ok) throw new Error("Error al aplicar tema");
      return res.json();
    },
    onSuccess: () => {
      toast.success(siteIdProp ? "Tema elegido en el borrador. Se aplica al publicar." : "Tema aplicado al sitio");
      queryClient.invalidateQueries({ queryKey: ["website-site"] });
      queryClient.invalidateQueries({ queryKey: ["website"] });
    },
    onError: (err) => toast.error(err?.code === "revision_conflict" ? "El sitio cambió. Recarga e inténtalo de nuevo." : "Error al aplicar el tema"),
  });

  function updateDraft(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
    setIsDirty(true);
  }

  if (siteQuery.isPending) return <LoadingState variant="page" />;

  if (!siteId) {
    return (
      <div className="p-4 md:p-6 space-y-5">
        <SiteSectionHeader icon={Palette} tone="violet" title="Tema" description="Personaliza los colores y la tipografía del sitio público." />
        <EmptyState
          icon={Palette}
          title="Sitio web no configurado"
          description='Configura tu sitio web primero desde la sección "Sitio web".'
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 h-full">
      <SiteSectionHeader
        icon={Palette}
        tone="violet"
        title="Tema"
        description="Personaliza los colores y la tipografía del sitio público."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/app/m/runly.website/templates")}>
            <LayoutTemplate className="mr-1.5 h-4 w-4" aria-hidden />
            Cambiar plantilla
          </Button>
        }
      />

      {themesQuery.isPending ? (
        <LoadingState message="Cargando temas..." />
      ) : themes.length === 0 ? (
        <EmptyState
          icon={Paintbrush}
          title="Todavía no hay temas"
          description="Crea un tema para definir los colores y las fuentes de tu sitio."
          action={{ label: "Crear primer tema", onClick: () => setNewThemeOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="min-w-0 space-y-4">
            {themes.length > 1 && (
              <ThemePicker
                themes={themes}
                activeThemeId={activeThemeId}
                appliedThemeId={appliedThemeId}
                onSelect={(id) => { setSelectedThemeId(id); setIsDirty(false); }}
              />
            )}

            {themeDetailQuery.isPending ? (
              <LoadingState message="Cargando tema..." />
            ) : themeDetail ? (
              <div className="space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ChipTabs
                    ariaLabel="Secciones del tema"
                    showDescription={false}
                    tabs={TABS.map((tab) => ({ value: tab, label: TAB_LABELS[tab], icon: TAB_ICONS[tab], badge: isDirty ? "*" : undefined }))}
                    value={activeTab}
                    onChange={setActiveTab}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {appliedThemeId !== activeThemeId ? (
                      <Button variant="outline" size="sm" onClick={() => useSiteThemeMutation.mutate()} disabled={useSiteThemeMutation.isPending}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
                        Usar este tema
                      </Button>
                    ) : (
                      <StatusPill tone="success" icon={CheckCircle2}>En uso</StatusPill>
                    )}
                    <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !isDirty}>
                      <Save className="mr-1.5 h-4 w-4" aria-hidden />
                      {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
                    </Button>
                  </div>
                </div>

                {activeTab === "Colores" ? (
                  <ThemeColorEditor tokens={draft.tokens} onChange={(tokens) => updateDraft("tokens", tokens)} />
                ) : (
                  <ThemeTypographyEditor typography={draft.typography} onChange={(typography) => updateDraft("typography", typography)} />
                )}
              </div>
            ) : null}
          </div>

          <ThemePreviewCard tokens={draft.tokens} typography={draft.typography} isDirty={isDirty} />
        </div>
      )}

      <Dialog open={newThemeOpen} onOpenChange={setNewThemeOpen}>
        <DialogContent size="md">
          <DialogHeader icon={Paintbrush}>
            <DialogTitle>Nuevo tema</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createThemeMutation.mutate(newThemeName);
            }}
            className="space-y-4 py-2"
          >
            <TextField
              label="Nombre del tema"
              value={newThemeName}
              onChange={(e) => setNewThemeName(e.target.value)}
              placeholder="Predeterminado"
              required
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewThemeOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createThemeMutation.isPending || !newThemeName.trim()}>
                {createThemeMutation.isPending ? "Creando..." : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
