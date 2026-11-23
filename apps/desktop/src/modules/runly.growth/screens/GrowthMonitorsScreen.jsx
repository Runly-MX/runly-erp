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
import { Activity, BellRing, Globe, Link2, Pencil, Play, Plus, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "../../../auth/AuthProvider.jsx";
import { runly } from "../../../lib/runly.js";
import { GrowthCard } from "../components/GrowthMobileCards.jsx";
import { MonitorConnectionDialog } from "../components/MonitorConnectionDialog.jsx";
import { MonitorDetectDialog } from "../components/MonitorDetectDialog.jsx";
import { MonitorDialog } from "../components/MonitorDialog.jsx";
import { MonitorMaintenanceDialog } from "../components/MonitorMaintenanceDialog.jsx";
import { StatusPageDialog } from "../components/StatusPageDialog.jsx";
import { AlertRecipientsDialog } from "../components/AlertRecipientsDialog.jsx";

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
const TYPE_LABEL = {
  http: "Disponibilidad",
  ssl: "Certificado SSL",
  keyword: "Texto en la pagina",
  api: "API o login",
  heartbeat: "Senal de proceso",
  domain: "Vencimiento del dominio",
  tcp: "Puerto (TCP)",
  dns: "Registros DNS",
};

const pct = (value) => (value == null ? "-" : `${value}%`);

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "-";
}

function statusBadge(monitor) {
  if (monitor.config?.maintenanceUntil && new Date(monitor.config.maintenanceUntil) > new Date()) {
    return <Badge variant="secondary">En mantenimiento</Badge>;
  }
  return <Badge variant={STATUS_VARIANT[monitor.status] ?? "secondary"}>{STATUS_LABEL[monitor.status] ?? monitor.status}</Badge>;
}

function metricText(m) {
  if (m.type === "ssl" || m.type === "domain") return m.sslDaysLeft == null ? "-" : `${m.sslDaysLeft} dias`;
  return m.latestLatencyMs == null ? "-" : `${m.latestLatencyMs} ms`;
}

export default function GrowthMonitorsScreen() {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const permissions = userProfile?.permissions ?? [];
  const canAccess = Boolean(userProfile?.isAdmin || permissions.includes("growth.access"));
  const canManage = Boolean(userProfile?.isAdmin || permissions.includes("growth.properties.manage"));
  const queryClient = useQueryClient();
  const [dialogTarget, setDialogTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [checkingId, setCheckingId] = useState(null);
  const [detectOpen, setDetectOpen] = useState(false);
  const [maintenanceTarget, setMaintenanceTarget] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [connection, setConnection] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const usersQuery = useQuery({
    queryKey: ["growth", "form-assignees"],
    queryFn: () => runly.growth.listFormAssignees(token),
    enabled: Boolean(token && canManage && alertsOpen),
  });
  const alertsMutation = useMutation({
    mutationFn: ({ propertyId, payload }) => runly.growth.updateProperty(propertyId, payload, token),
    onSuccess: () => {
      toast.success("Destinatarios de alertas guardados");
      queryClient.invalidateQueries({ queryKey: ["growth", "properties"] });
      setAlertsOpen(false);
    },
    onError: (err) => toast.error(err?.message || "No se pudieron guardar los destinatarios"),
  });

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

  const statusPagesQuery = useQuery({
    queryKey: ["growth", "status-pages"],
    queryFn: () => runly.growth.listStatusPages(token),
    enabled: Boolean(token && canAccess),
  });

  const statusPageMutation = useMutation({
    mutationFn: ({ propertyId, payload, regenerate }) =>
      regenerate ? runly.growth.regenerateStatusPageLink(propertyId, token) : runly.growth.saveStatusPage(propertyId, payload, token),
    onSuccess: (_res, { regenerate }) => {
      toast.success(regenerate ? "Enlace nuevo generado" : "Pagina de estado guardada");
      queryClient.invalidateQueries({ queryKey: ["growth", "status-pages"] });
    },
    onError: (err) => toast.error(err?.message || "No se pudo guardar la pagina de estado"),
  });

  const realErrorsQuery = useQuery({
    queryKey: ["growth", "real-errors"],
    queryFn: () => runly.growth.listRealErrors(token),
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
    onSuccess: (res) => {
      toast.success("Monitor guardado");
      setDialogTarget(null);
      if (res?.data?.pingToken) setConnection({ monitor: res.data, token: res.data.pingToken });
      refresh();
    },
    onError: (err) => toast.error(err?.message || "No se pudo guardar el monitor"),
  });

  const disableMutation = useMutation({
    mutationFn: (id) => runly.growth.disableMonitor(id, token),
    onSuccess: () => {
      toast.success("Monitor eliminado");
      setDeleteTarget(null);
      refresh();
    },
    onError: (err) => toast.error(err?.message || "No se pudo eliminar el monitor"),
  });

  const regenerateMutation = useMutation({
    mutationFn: (id) => runly.growth.regenerateMonitorToken(id, token),
    onSuccess: (res) => {
      setConnection({ monitor: res.data, token: res.data.pingToken });
      refresh();
    },
    onError: (err) => toast.error(err?.message || "No se pudo generar la direccion"),
  });

  const maintenanceMutation = useMutation({
    mutationFn: ({ id, minutes }) => runly.growth.setMonitorMaintenance(id, minutes, token),
    onSuccess: (_res, { minutes }) => {
      toast.success(minutes ? "Mantenimiento activado" : "Mantenimiento terminado");
      setMaintenanceTarget(null);
      refresh();
    },
    onError: (err) => toast.error(err?.message || "No se pudo cambiar el mantenimiento"),
  });

  async function handleCreateDetected(propertyId, suggestions, withHeartbeat) {
    for (const suggestion of suggestions) {
      await runly.growth.createMonitor({ propertyId, type: suggestion.type, name: suggestion.name, config: suggestion.config, ...(suggestion.intervalSeconds ? { intervalSeconds: suggestion.intervalSeconds } : {}) }, token);
    }
    if (withHeartbeat) {
      const { data } = await runly.growth.createMonitor(
        { propertyId, type: "heartbeat", name: "Proceso interno", config: { graceSeconds: 60 }, intervalSeconds: 300 },
        token,
      );
      setConnection({ monitor: data, token: data.pingToken });
    }
    toast.success("Monitores creados");
    refresh();
  }

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

  // Same buttons in the table (icons) and in the phone cards (icon + label, 44px targets).
  const monitorActions = (m, labeled) => {
    const btn = (label, Icon, onClick, extra = {}) => (
      <Button key={label} type="button" variant="outline" size={labeled ? "default" : "icon"} title={label} aria-label={label} onClick={onClick} {...extra}>
        <Icon className="h-4 w-4" />
        {labeled ? <span className="ml-2">{label}</span> : null}
      </Button>
    );
    return [
      btn("Probar ahora", Play, () => handleCheckNow(m), { disabled: checkingId === m.id }),
      m.type === "heartbeat" ? btn("Conexion", Link2, () => setConnection({ monitor: m, token: null })) : null,
      btn("Mantenimiento", Wrench, () => setMaintenanceTarget(m)),
      btn("Editar", Pencil, () => setDialogTarget(m)),
      m.enabled ? btn("Eliminar", Trash2, () => setDeleteTarget(m)) : null,
    ];
  };

  const columns = useMemo(
    () => [
      { accessorKey: "name", header: "Monitor" },
      { id: "property", accessorFn: (m) => propertyName.get(m.propertyId) ?? "", header: "Sitio", cell: ({ row }) => propertyName.get(row.original.propertyId) ?? "-" },
      { accessorKey: "type", header: "Tipo", cell: ({ row }) => TYPE_LABEL[row.original.type] ?? row.original.type },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            {statusBadge(row.original)}
            {row.original.lastError ? (
              <p className="max-w-64 truncate text-xs text-[hsl(var(--muted-foreground))]" title={row.original.lastError}>
                {row.original.lastError}
              </p>
            ) : null}
          </div>
        ),
      },
      { id: "uptime", accessorFn: (m) => m.uptime24h ?? -1, header: "Uptime", cell: ({ row }) => `${pct(row.original.uptime24h)} / ${pct(row.original.uptime30d)}` },
      {
        id: "metric",
        accessorFn: (m) => (m.type === "ssl" || m.type === "domain" ? m.sslDaysLeft : m.latestLatencyMs) ?? -1,
        header: "Latencia",
        cell: ({ row }) => metricText(row.original),
      },
      { id: "checked", accessorFn: (m) => m.lastCheckedAt ?? "", header: "Revision", cell: ({ row }) => formatDateTime(row.original.lastCheckedAt) },
      ...(canManage
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }) => <div className="flex justify-end gap-1.5">{monitorActions(row.original, false)}</div>,
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
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setAlertsOpen(true)}>
                <BellRing className="mr-2 h-4 w-4" />
                Alertas
              </Button>
              <Button type="button" variant="outline" onClick={() => setStatusOpen(true)}>
                <Globe className="mr-2 h-4 w-4" />
                Pagina de estado
              </Button>
              <Button type="button" variant="outline" onClick={() => setDetectOpen(true)}>
                <Search className="mr-2 h-4 w-4" />
                Detectar y crear
              </Button>
              <Button type="button" onClick={() => setDialogTarget({})}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo monitor
              </Button>
            </div>
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
          searchPlaceholder="Buscar..."
          mobileCards
          renderCard={(m) => (
            <GrowthCard
              title={m.name}
              subtitle={propertyName.get(m.propertyId)}
              badge={statusBadge(m)}
              rows={[
                ["Tipo", TYPE_LABEL[m.type] ?? m.type],
                ["Uptime 24h / 30d", `${pct(m.uptime24h)} / ${pct(m.uptime30d)}`],
                [m.type === "ssl" || m.type === "domain" ? "Vence en" : "Latencia", metricText(m)],
                ["Revision", formatDateTime(m.lastCheckedAt)],
                ...(m.lastError ? [["Detalle", m.lastError]] : []),
              ]}
              actions={canManage ? monitorActions(m, true) : null}
            />
          )}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Incidentes recientes</h2>
        <DataTable
          columns={[
            { id: "monitor", accessorFn: (i) => monitorName.get(i.monitorId) ?? "", header: "Monitor", cell: ({ row }) => monitorName.get(row.original.monitorId) ?? "-" },
            { id: "started", accessorFn: (i) => i.startedAt ?? "", header: "Inicio", cell: ({ row }) => formatDateTime(row.original.startedAt) },
            {
              id: "state",
              accessorFn: (i) => (i.resolvedAt ? 1 : 0),
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
          searchPlaceholder="Buscar..."
          mobileCards
          renderCard={(i) => (
            <GrowthCard
              title={monitorName.get(i.monitorId) ?? "-"}
              badge={i.resolvedAt ? <Badge variant="success">Resuelto</Badge> : <Badge variant="destructive">Abierto</Badge>}
              rows={[
                ["Inicio", formatDateTime(i.startedAt)],
                ["Resuelto", formatDateTime(i.resolvedAt)],
                ["Causa", i.cause],
              ]}
            />
          )}
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

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Errores reales de visitantes (ultimas 24 h)</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Fallas del servidor que vieron personas navegando tu sitio. Se activan al copiar el codigo de Sitios conectados con la opcion de errores reales.
          </p>
        </div>
        <DataTable
          columns={[
            { accessorKey: "siteName", header: "Sitio" },
            { id: "route", accessorFn: (e) => `${e.host ?? ""}${e.path ?? ""}`, header: "Ruta", cell: ({ row }) => `${row.original.host ?? ""}${row.original.path ?? ""}` },
            {
              id: "status",
              accessorFn: (e) => (e.kind === "network" ? 0 : e.status),
              header: "Error",
              cell: ({ row }) => (row.original.kind === "network" ? "Sin conexion" : `HTTP ${row.original.status}`),
            },
            { accessorKey: "total", header: "Reportes" },
            { accessorKey: "sessions", header: "Visitantes" },
            { id: "last", accessorFn: (e) => e.lastSeen ?? "", header: "Ultimo", cell: ({ row }) => formatDateTime(row.original.lastSeen) },
          ]}
          data={realErrorsQuery.data?.data ?? []}
          isLoading={realErrorsQuery.isLoading}
          emptyIcon={Activity}
          emptyTitle="Sin errores reportados"
          emptyDescription="Cuando un visitante encuentre una falla del servidor, aparecera aqui agrupada por ruta."
          searchPlaceholder="Buscar..."
          mobileCards
          renderCard={(e) => (
            <GrowthCard
              title={`${e.host ?? ""}${e.path ?? ""}`}
              subtitle={e.siteName}
              badge={<Badge variant="destructive">{e.kind === "network" ? "Sin conexion" : `HTTP ${e.status}`}</Badge>}
              rows={[["Reportes", e.total], ["Visitantes", e.sessions], ["Ultimo", formatDateTime(e.lastSeen)]]}
            />
          )}
        />
      </section>

      <MonitorDetectDialog
        open={detectOpen}
        onOpenChange={setDetectOpen}
        properties={properties}
        onDetect={(url) => runly.growth.discoverMonitors({ url }, token)}
        onCreate={handleCreateDetected}
      />

      <AlertRecipientsDialog
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        properties={properties}
        users={usersQuery.data?.data ?? []}
        saving={alertsMutation.isPending}
        onSave={(propertyId, payload) => alertsMutation.mutate({ propertyId, payload })}
      />

      <StatusPageDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        properties={properties}
        pages={statusPagesQuery.data?.data ?? []}
        saving={statusPageMutation.isPending}
        onSave={(propertyId, payload) => statusPageMutation.mutate({ propertyId, payload })}
        onRegenerate={(propertyId) => statusPageMutation.mutate({ propertyId, regenerate: true })}
      />

      <MonitorMaintenanceDialog
        open={Boolean(maintenanceTarget)}
        onOpenChange={(open) => { if (!open) setMaintenanceTarget(null); }}
        monitor={maintenanceTarget}
        saving={maintenanceMutation.isPending}
        onSave={(minutes) => maintenanceMutation.mutate({ id: maintenanceTarget.id, minutes })}
      />

      <MonitorConnectionDialog
        open={Boolean(connection)}
        onOpenChange={(open) => { if (!open) setConnection(null); }}
        monitor={connection?.monitor}
        pingToken={connection?.token}
        regenerating={regenerateMutation.isPending}
        onRegenerate={canManage ? () => regenerateMutation.mutate(connection.monitor.id) : null}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Eliminar monitor"
        description={`Dejaremos de revisar "${deleteTarget?.name ?? ""}" y desaparecera de la lista. El historial se conserva.`}
        confirmLabel="Eliminar"
        loading={disableMutation.isPending}
        onConfirm={() => disableMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
