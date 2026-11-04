import { companyFetch } from '../../../lib/companyFetch.js'
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { getApiUrl } from "../../../lib/runtimeConfig.js";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  SelectField,
  TextField,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  LoadingState,
} from "@runly/ui";
import { Menu as MenuIcon, Plus, Trash2 } from "lucide-react";
import { useScopedSite } from "../hooks/useScopedSite.js";
import { toast } from "sonner";
import MenuItemTree from "./MenuItemTree.jsx";
import { SiteSectionHeader } from "../components/SiteSectionHeader.jsx";
import { MenusList, MENU_LOCATION_ICONS } from "../components/MenusList.jsx";

const LOCATION_LABELS = {
  header: "Encabezado",
  footer: "Pie de página",
  sidebar: "Barra lateral",
};

const LOCATION_OPTIONS = [
  { value: "header", label: "Encabezado" },
  { value: "footer", label: "Pie de página" },
  { value: "sidebar", label: "Barra lateral" },
];

async function apiGet(path, token) {
  const res = await companyFetch(`${getApiUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function WebsiteMenusScreen({ siteId: siteIdProp = null }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();

  const [selectedMenuId, setSelectedMenuId] = useState(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuForm, setNewMenuForm] = useState({
    name: "",
    location: "header",
  });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const siteQuery = useScopedSite(siteIdProp);
  const siteId = siteQuery.data?.data?.id ?? null;

  const menusQuery = useQuery({
    queryKey: ["website-menus", siteId, token],
    queryFn: () => apiGet(`/website/menus?siteId=${siteId}`, token),
    enabled: Boolean(token) && Boolean(siteId),
    staleTime: 15_000,
  });

  const menus = menusQuery.data?.data ?? [];
  const activeId = selectedMenuId ?? menus[0]?.id ?? null;
  const selectedMenu = menus.find((m) => m.id === activeId) ?? null;

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const createMenuMutation = useMutation({
    mutationFn: async (data) => {
      const res = await companyFetch(`${getApiUrl()}/website/menus`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...data, siteId }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({}))).error || `HTTP ${res.status}`,
        );
      return res.json();
    },
    onSuccess: (menu) => {
      toast.success("Menu creado");
      queryClient.invalidateQueries({ queryKey: ["website-menus", siteId] });
      setSelectedMenuId(menu.id);
      setNewMenuOpen(false);
      setNewMenuForm({ name: "", location: "header" });
    },
    onError: (err) => toast.error(err.message || "Error al crear menu"),
  });

  const deleteMenuMutation = useMutation({
    mutationFn: async (menuId) => {
      const res = await companyFetch(`${getApiUrl()}/website/menus/${menuId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al eliminar");
    },
    onSuccess: () => {
      toast.success("Menu eliminado");
      setSelectedMenuId(null);
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ["website-menus", siteId] });
    },
    onError: () => {
      toast.error("Error al eliminar el menu");
      setConfirmDelete(null);
    },
  });

  function handleReorder(reorderedItems) {
    queryClient.setQueryData(["website-menus", siteId, token], (prev) => {
      if (!prev?.data) return prev;
      return {
        ...prev,
        data: prev.data.map((m) =>
          m.id === activeId ? { ...m, items: reorderedItems } : m,
        ),
      };
    });
  }

  if (siteQuery.isPending) return <LoadingState variant="page" />;

  const header = (actions) => (
    <SiteSectionHeader
      icon={MenuIcon}
      tone="blue"
      title="Menús"
      description="Organiza los enlaces de navegación de tu sitio público."
      actions={actions}
    />
  );

  if (!siteId) {
    return (
      <div className="p-4 md:p-6 space-y-5">
        {header()}
        <EmptyState
          icon={MenuIcon}
          title="Sitio web no configurado"
          description='Configura tu sitio web primero desde la sección "Sitio web".'
        />
      </div>
    );
  }

  const SelectedIcon = MENU_LOCATION_ICONS[selectedMenu?.location] ?? MenuIcon;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {header(
        menus.length > 0 && (
          <Button onClick={() => setNewMenuOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Nuevo menú
          </Button>
        ),
      )}

      {menusQuery.isPending ? (
        <LoadingState message="Cargando menús..." />
      ) : menus.length === 0 ? (
        <EmptyState
          icon={MenuIcon}
          title="Todavía no hay menús"
          description="Crea un menú para que tus visitantes encuentren tus páginas desde el encabezado o el pie de página."
          action={{
            label: "Crear primer menú",
            onClick: () => setNewMenuOpen(true),
          }}
        />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <MenusList menus={menus} activeId={activeId} locationLabels={LOCATION_LABELS} onSelect={setSelectedMenuId} />

          <div className="min-w-0 flex-1">
            {selectedMenu ? (
              <section aria-label={selectedMenu.name} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                <div className="flex flex-wrap items-center gap-3 border-b border-[hsl(var(--border))] p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400"><SelectedIcon className="h-5 w-5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-[hsl(var(--foreground))]">{selectedMenu.name}</h2>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Ubicación: {LOCATION_LABELS[selectedMenu.location] ?? selectedMenu.location}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(selectedMenu)}
                    className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]"
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                    Eliminar menú
                  </Button>
                </div>
                <div className="p-4">
                  <MenuItemTree
                    menuId={selectedMenu.id}
                    items={selectedMenu.items ?? []}
                    onReorder={handleReorder}
                    onRefresh={() =>
                      queryClient.invalidateQueries({
                        queryKey: ["website-menus", siteId],
                      })
                    }
                  />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      )}

      <Dialog open={newMenuOpen} onOpenChange={setNewMenuOpen}>
        <DialogContent size="md">
          <DialogHeader icon={MenuIcon}>
            <DialogTitle>Nuevo menú</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMenuMutation.mutate(newMenuForm);
            }}
            className="space-y-4 py-2"
          >
            <TextField
              label="Nombre"
              value={newMenuForm.name}
              onChange={(e) =>
                setNewMenuForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Principal"
              required
              autoFocus
            />
            <SelectField
              label="Ubicación"
              value={newMenuForm.location}
              onChange={(v) => setNewMenuForm((f) => ({ ...f, location: v }))}
              options={LOCATION_OPTIONS}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewMenuOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  createMenuMutation.isPending || !newMenuForm.name.trim()
                }
              >
                {createMenuMutation.isPending ? "Creando..." : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Eliminar menú"
        description={`Se eliminará permanentemente el menú "${confirmDelete?.name}". Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleteMenuMutation.isPending}
        onConfirm={() => deleteMenuMutation.mutate(confirmDelete?.id)}
      />
    </div>
  );
}
