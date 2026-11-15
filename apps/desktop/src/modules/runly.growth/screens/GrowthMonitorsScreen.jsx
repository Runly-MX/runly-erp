import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  PageHeader,
} from "@runly/ui";
import { Activity, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "../../../auth/AuthProvider.jsx";
import { runly } from "../../../lib/runly.js";
import { MonitorDialog } from "../components/MonitorDialog.jsx";

const STATUS_LABEL = {
  up: "En linea",
  down: "Caido",
  degraded: "Con advertencia",
  paused: "Pausado",
  unknown: "Sin datos",
};
const STATUS_VARIANT = {
  up: "success",
  down: "destructive",
  degraded: "warning",
  paused: "secondary",
  unknown: "secondary",
};
const TYPE_LABEL = { http: "Disponibilidad", ssl: "Certificado SSL" };

const pct = (value) => (value == null ? "-" : `${value}%`);

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "-";
}

export default function GrowthMonitorsScreen() {
  const { token, permissions = [], userProfile } = useAuth();
  const canAccess = Boolean(userProfile?.isAdmin || permissions.includes("growth.access"));
  const canManage = Boolean(userProfile?.isAdmin || permissions.includes("growth.properties.manage"));
  const queryClient = useQueryClient();
  const [dialogTarget, setDialogTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [checkingId, setCheckingId] = useState(null);

  const monitorsQuery = useQuery({
    queryKey: ["growth", "monitors"],
    queryFn: () => runly.growth.listMonitors(token),
    enabled: Boolean(token && canAccess),
    refetchInterval: 30_000,
  });
  const propertiesQuery = useQuery({
    queryKey: ["growth", "properties"],
    queryFn: () => runly.growth.listProperties(token),
    enabled: Boolean(token && canAccess),
  });
  const incidentsQuery = useQuery({
    queryKey: ["growth", "incidents"],
    queryFn: () => runly.growth.listMonitorIncidents(token),
    enabled: Boolean(token && canAccess),
    refetchInterval: 60_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["growth", "monitors"] });
    queryClient.invalidateQueries({ queryKey: ["growth", "incidents"] });
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      id ? runly.growth.updateMonitor(id, payload, token) : runly.growth.createMonitor(payload, token),
    onSuccess: () => {
      toast.success("Monitor guardado");
      setDialogTarget(null);
      refresh();
    },
    onError: (err) => toast.error(err?.message || "No se pudo guardar el monitor"),
  });

  const disableMutation = useMutation({
    mutationFn: (id) => runly.growth.disableMonitor(id, token),
    onSuccess: () => {
      toast.success("Monitor desactivado");
      setDeleteTarget(null);
      refresh();
    },
    onError: (err) => toast.error(err?.message || "No se pudo desactivar el monitor"),
  });

  async function handleCheckNow(monitor) {
    setCheckingId(monitor.id);
    try {
      const { data } = await runly.growth.checkMonitorNow(monitor.id, token);
      if (data.ok) toast.success(data.error ? `Responde, con advertencia: ${data.error}` : "El sitio responde correctamente.");
      else toast.error(data.error || "La prueba fallo.");
      refresh();
    } catch (err) {
      toast.error(err?.message || "No se pudo probar el monitor");
    } finally {
      setCheckingId(null);
    }
  }

  const properties = propertiesQuery.data?.data ?? [];
  const propertyName = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties]);
  const monitorName = useMemo(
    () => new Map((monitorsQuery.data?.data ?? []).map((m) => [m.id, m.name])),
    [monitorsQuery.data],
  );

  const columns = useMemo(
    () => [
      { accessorKey: "name", header: "Monitor" },
      { id: "property", header: "Sitio", cell: ({ row }) => propertyName.get(row.original.propertyId) ?? "-" },
      { accessorKey: "type", header: "Tipo", cell: ({ row }) => TYPE_LABEL[row.original.type] ?? row.original.type },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <Badge variant={STATUS_VARIANT[row.original.status] ?? "secondary"}>
              {STATUS_LABEL[row.original.status] ?? row.original.status}
            </Badge>
            {row.original.lastError ? (
              <p className="max-w-64 truncate text-xs text-[hsl(var(--muted-foreground))]" title={row.original.lastError}>
                {row.original.lastError}
              </p>
            ) : null}
          </div>
        ),
      },
      { id: "uptime", header: "Uptime 24 h / 30 d", cell: ({ row }) => `${pct(row.original.uptime24h)} / ${pct(row.original.uptime30d)}` },
      {
        id: "metric",
        header: "Latencia / SSL",
        cell: ({ row }) =>
          row.original.type === "ssl"
            ? row.original.sslDaysLeft == null ? "-" : `${row.original.sslDaysLeft} dias`
            : row.original.latestLatencyMs == null ? "-" : `${row.original.latestLatencyMs} ms`,
      },
      { id: "checked", header: "Ultima revision", cell: ({ row }) => formatDateTime(row.original.lastCheckedAt) },
      ...(canManage
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }) => (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={checkingId === row.original.id} onClick={() => handleCheckNow(row.original)}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    {checkingId === row.original.id ? "Probando..." : "Probar ahora"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDialogTarget(row.original)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  {row.original.enabled ? (
                    <Button type="button" variant="outline" size="sm" aria-label="Desactivar monitor" onClick={() => setDeleteTarget(row.original)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ),
            },
          ]
        : []),
    ],
    // handleCheckNow only reads stable state setters and the token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, checkingId, propertyName, token],
  );

  if (!canAccess) {
    return (
      <div className="min-h-dvh p-4 md:p-6">
        <PageHeader eyebrow="Runly Growth" title="Monitores" />
        <ErrorState description="No tienes permisos para ver los monitores." />
      </div>
    );
  }

  const incidents = incidentsQuery.data?.data ?? [];

  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="Runly Growth"
        title="Monitores"
        description="Revisiones activas de tus sitios: disponibilidad y certificado SSL. Recibes un aviso cuando un sitio cae, se recupera o su certificado esta por vencer."
        actions={
          canManage ? (
            <Button type="button" onClick={() => setDialogTarget({})}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo monitor
            </Button>
          ) : null
        }
      />

      {monitorsQuery.isError ? (
        <ErrorState description={monitorsQuery.error?.message} onRetry={() => monitorsQuery.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={monitorsQuery.data?.data ?? []}
          isLoading={monitorsQuery.isLoading}
          emptyIcon={Activity}
          emptyTitle="Sin monitores"
          emptyDescription="Conecta un sitio con dominio en Sitios conectados y crearemos sus monitores automaticamente."
          showToolbar={false}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Incidentes recientes</h2>
        <DataTable
          columns={[
            { id: "monitor", header: "Monitor", cell: ({ row }) => monitorName.get(row.original.monitorId) ?? "-" },
            { id: "started", header: "Inicio", cell: ({ row }) => formatDateTime(row.original.startedAt) },
            {
              id: "state",
              header: "Estado",
              cell: ({ row }) =>
                row.original.resolvedAt ? (
                  <Badge variant="success">Resuelto {formatDateTime(row.original.resolvedAt)}</Badge>
                ) : (
                  <Badge variant="destructive">Abierto</Badge>
                ),
            },
            { accessorKey: "cause", header: "Causa" },
          ]}
          data={incidents}
          isLoading={incidentsQuery.isLoading}
          emptyIcon={Activity}
          emptyTitle="Sin incidentes"
          emptyDescription="Cuando un sitio deje de responder aparecera aqui con su duracion."
          showToolbar={false}
        />
      </section>

      <MonitorDialog
        open={dialogTarget !== null}
        onOpenChange={(open) => { if (!open) setDialogTarget(null); }}
        monitor={dialogTarget?.id ? dialogTarget : null}
        properties={properties}
        saving={saveMutation.isPending}
        onSave={(payload) => saveMutation.mutate({ id: dialogTarget?.id ?? null, payload })}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Desactivar monitor"
        description={`Dejaremos de revisar "${deleteTarget?.name ?? ""}". El historial se conserva.`}
        confirmLabel="Desactivar"
        onConfirm={() => disableMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
