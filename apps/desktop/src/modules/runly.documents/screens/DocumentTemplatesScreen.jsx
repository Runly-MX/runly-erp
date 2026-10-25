import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  TemplateManager,
  cn,
  useOfficeActions,
} from "@runly/ui";
import { LayoutTemplate } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "../../../auth/AuthProvider.jsx";
import { runly } from "../../../lib/runly.js";

// Module that registers a kind: the first segment of its key.
const MODULE_LABELS = {
  inventory: "Inventario",
  lms: "Capacitación",
  growth: "Growth",
  hr: "Recursos humanos",
  contacts: "Contactos",
  purchases: "Compras",
  fleet: "Flotilla",
  manual: "Manual",
};
const moduleOf = (kindKey) => String(kindKey).split(".")[0];
const moduleLabel = (key) => MODULE_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

export default function DocumentTemplatesScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const office = useOfficeActions();
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const permissions = userProfile?.permissions ?? [];
  const allowed = (key) => userProfile?.isAdmin || permissions.includes(key);
  const canRead = allowed("documents.templates.read");
  const canManage = allowed("documents.templates.create") || allowed("documents.templates.update");
  const [selected, setSelected] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);

  const kindsQuery = useQuery({
    queryKey: ["documents", "kinds"],
    queryFn: () => runly.documents.listKinds(token),
    enabled: Boolean(token && canRead),
    staleTime: 60_000,
  });
  const legacyQuery = useQuery({
    queryKey: ["documents", "templates"],
    queryFn: () => runly.documents.listTemplates(token, { enabled: true, pageSize: 100 }),
    enabled: Boolean(token && canRead),
    staleTime: 30_000,
  });
  const toggleMutation = useMutation({
    mutationFn: (item) =>
      runly.documents.setTemplateEnabled(item.id, { enabled: !item.enabled, updatedAt: item.updatedAt }, token),
    onSuccess: async () => {
      setToggleTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["documents", "templates"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const kinds = kindsQuery.data?.items ?? [];
  const groups = useMemo(() => {
    const map = new Map();
    for (const kind of kinds) {
      const key = moduleOf(kind.key);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(kind);
    }
    return [...map.entries()].sort((a, b) => moduleLabel(a[0]).localeCompare(moduleLabel(b[0])));
  }, [kinds]);
  const active = kinds.find((kind) => kind.key === selected) ?? kinds[0] ?? null;

  const legacy = (legacyQuery.data?.items ?? []).filter((item) => !item.format || item.format === "blocks");
  const legacyColumns = useMemo(() => [
    {
      accessorKey: "name",
      header: "Plantilla",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left font-medium hover:underline"
          onClick={() => navigate(`/app/m/runly.documents/templates/${row.original.id}/editor`)}
        >
          {row.original.name}
          <span className="block text-xs text-[hsl(var(--muted-foreground))]">{row.original.key}</span>
        </button>
      ),
    },
    { accessorKey: "sourceType", header: "Origen" },
    {
      id: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={row.original.publishedVersionId ? "success" : "secondary"}>
          {row.original.publishedVersionId ? "Publicada" : "Borrador"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => allowed("documents.templates.delete") ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setToggleTarget(row.original)}>
          Desactivar
        </Button>
      ) : null,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [navigate, permissions, userProfile?.isAdmin]);

  const onEditDocument = office?.enabled && office?.canEdit
    ? (template) => {
        const fileId = template.version?.fileAssetId;
        if (!fileId) return;
        navigate(`/app/m/runly.files/files/${encodeURIComponent(fileId)}/edit`, {
          state: { officeReturnTo: location.pathname, officeInvalidate: ["documents"] },
        });
      }
    : undefined;

  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="Runly Documents"
        title="Plantillas"
        description="Sube tu propio formato en Word, Excel, PowerPoint o PDF para cada tipo de documento de la empresa."
      />

      {!canRead ? (
        <ErrorState title="Sin acceso" description="No tienes permiso para ver las plantillas." showReport={false} />
      ) : kindsQuery.isLoading ? (
        <LoadingState />
      ) : kindsQuery.isError ? (
        <ErrorState title="No se pudieron cargar los tipos de documento" onRetry={() => kindsQuery.refetch()} />
      ) : !kinds.length ? (
        <EmptyState
          icon={LayoutTemplate}
          title="Aún no hay tipos de documento"
          description="Los módulos que generan documentos aparecerán aquí para que subas sus plantillas."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Tipos de documento" className="space-y-4">
            {groups.map(([moduleKey, items]) => (
              <div key={moduleKey} className="space-y-1">
                <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  {moduleLabel(moduleKey)}
                </p>
                {items.map((kind) => (
                  <button
                    key={kind.key}
                    type="button"
                    onClick={() => setSelected(kind.key)}
                    aria-current={active?.key === kind.key ? "true" : undefined}
                    className={cn(
                      "w-full rounded-md px-2 py-2 text-left text-sm",
                      active?.key === kind.key
                        ? "bg-[hsl(var(--muted))] font-medium"
                        : "hover:bg-[hsl(var(--muted))]/60",
                    )}
                  >
                    {kind.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <section className="min-w-0 space-y-3">
            <h2 className="text-base font-semibold">{active?.label}</h2>
            {active ? (
              <TemplateManager
                key={active.key}
                client={runly.documents}
                token={token}
                kind={active}
                canManage={canManage}
                onEditDocument={onEditDocument}
                onOpenLegacy={(template) => navigate(`/app/m/runly.documents/templates/${template.id}/editor`)}
              />
            ) : null}
          </section>
        </div>
      )}

      {legacy.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Plantillas anteriores (bloques)</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Siguen disponibles para generar documentos. Las plantillas nuevas se crean con tu propio archivo.
            </p>
          </div>
          <DataTable
            columns={legacyColumns}
            data={legacy}
            isLoading={legacyQuery.isLoading}
            isError={legacyQuery.isError}
            onRetry={() => legacyQuery.refetch()}
            emptyIcon={LayoutTemplate}
            emptyTitle="No hay plantillas anteriores"
            searchPlaceholder="Buscar plantillas..."
          />
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title="Desactivar plantilla"
        description="La plantilla dejará de estar disponible para nuevas generaciones."
        confirmLabel="Desactivar"
        onConfirm={() => toggleMutation.mutate(toggleTarget)}
        loading={toggleMutation.isPending}
      />
    </div>
  );
}
