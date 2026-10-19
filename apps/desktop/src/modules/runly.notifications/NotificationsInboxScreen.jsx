import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SelectField,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TextField,
} from "@runly/ui";
import { Bell, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthProvider";
import { runly } from "../../lib/runly";
import { NotificationItem } from "../../components/notifications/NotificationItem";

const PAGE_SIZE = 25;

// Trailing dot = module prefix filter (handled by the notifications API).
const MODULE_OPTIONS = [
  { value: "all", label: "Todos los módulos" },
  { value: "calendar.", label: "Calendario" },
  { value: "projects.", label: "Proyectos" },
  { value: "inventory.", label: "Inventario" },
  { value: "ledger.", label: "Finanzas" },
  { value: "lms.", label: "Cursos" },
  { value: "notes.", label: "Notas" },
  { value: "growth.", label: "Crecimiento" },
  { value: "website.", label: "Sitio web y tienda" },
  { value: "system.", label: "Sistema" },
];

function dayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function groupByDay(items) {
  const groups = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt);
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function CounterPill({ value }) {
  if (!value) return null;
  return (
    <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white">
      {value > 99 ? "99+" : value}
    </span>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--border))] p-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificationsInboxScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, userProfile } = useAuth();
  const token = session?.access_token;

  const canRead = Boolean(
    userProfile?.isAdmin ||
      (userProfile?.permissions ?? []).includes("notifications.read"),
  );

  const [tab, setTab] = useState("general");
  const [filters, setFilters] = useState({
    q: "",
    unreadOnly: "false",
    priority: "all",
    module: "all",
  });

  const query = useInfiniteQuery({
    queryKey: ["notifications-inbox", token, tab, filters],
    queryFn: ({ pageParam }) =>
      runly.notifications.list(token, {
        limit: PAGE_SIZE,
        cursor: pageParam ?? undefined,
        category: tab,
        unreadOnly: filters.unreadOnly === "true",
        priority: filters.priority !== "all" ? filters.priority : undefined,
        eventType: tab === "general" && filters.module !== "all" ? filters.module : undefined,
        q: filters.q.trim() || undefined,
      }),
    getNextPageParam: (lastPage) => lastPage?.pageInfo?.nextCursor ?? undefined,
    initialPageParam: undefined,
    enabled: Boolean(token) && canRead,
  });

  const notifications = useMemo(() => {
    const pages = query.data?.pages ?? [];
    return pages.flatMap((page) => page?.data ?? []);
  }, [query.data]);

  const groups = useMemo(() => groupByDay(notifications), [notifications]);
  const counters = query.data?.pages?.[0]?.unreadByCategory ?? {};
  const unreadCount = (counters.messages ?? 0) + (counters.general ?? 0);

  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications-inbox", token] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);

  const markReadMutation = useMutation({
    mutationFn: (id) => runly.notifications.markRead(token, id),
    onSuccess: invalidateAll,
    onError: () => toast.error("No se pudo marcar la notificación"),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => runly.notifications.markAllRead(token),
    onSuccess: async (response) => {
      const updated = response?.data?.updated ?? response?.updated ?? 0;
      await invalidateAll();
      toast.success(
        updated > 0
          ? `${updated} notificaciones marcadas como leídas`
          : "No hay notificaciones pendientes",
      );
    },
    onError: () => toast.error("No se pudieron marcar como leídas"),
  });

  async function handleOpen(notification) {
    if (!notification) return;
    if (!notification.read) {
      await markReadMutation.mutateAsync(notification.id).catch(() => {});
    }
    if (notification.link) {
      if (/^https?:\/\//i.test(notification.link)) {
        window.open(notification.link, "_blank", "noopener,noreferrer");
      } else {
        navigate(notification.link);
      }
    }
  }

  if (!canRead) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader
          eyebrow="Runly Notifications"
          title="Notificaciones"
          description="Centro de alertas accionables de la plataforma."
        />
        <ErrorState message="No tienes permisos para consultar notificaciones." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        eyebrow="Runly Notifications"
        title="Notificaciones"
        description="Avisos de tus módulos y mensajes, con quién los generó y de dónde vienen."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => query.refetch()}
              disabled={query.isRefetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isRefetching ? "animate-spin" : ""}`}
              />
              Actualizar
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/app/m/runly.notifications/settings")}
            >
              Configuración
            </Button>
            <Button
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending || unreadCount === 0}
            >
              Marcar todo leído
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="general">
            <Bell className="h-4 w-4" />
            General
            <CounterPill value={counters.general} />
          </TabsTrigger>
          <TabsTrigger value="messages">
            <MessageCircle className="h-4 w-4" />
            Mensajes
            <CounterPill value={counters.messages} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-2xl border border-[hsl(var(--border))] p-4 space-y-3 bg-[hsl(var(--card))]">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <TextField
            label="Buscar"
            value={filters.q}
            onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            placeholder="Título o contenido..."
          />

          <SelectField
            label="Estado"
            value={filters.unreadOnly}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, unreadOnly: value }))}
            options={[
              { value: "false", label: "Todas" },
              { value: "true", label: "Solo no leídas" },
            ]}
          />

          <SelectField
            label="Prioridad"
            value={filters.priority}
            onValueChange={(value) => setFilters((prev) => ({ ...prev, priority: value }))}
            options={[
              { value: "all", label: "Todas" },
              { value: "low", label: "Baja" },
              { value: "medium", label: "Media" },
              { value: "high", label: "Alta" },
              { value: "critical", label: "Crítica" },
            ]}
          />

          {tab === "general" && (
            <SelectField
              label="Módulo"
              value={filters.module}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, module: value }))}
              options={MODULE_OPTIONS}
            />
          )}
        </div>
      </div>

      {query.isLoading ? (
        <NotificationsSkeleton />
      ) : query.isError ? (
        <ErrorState
          title="No se pudieron cargar las notificaciones"
          onRetry={() => query.refetch()}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={tab === "messages" ? MessageCircle : Bell}
          title={tab === "messages" ? "Sin mensajes" : "Sin notificaciones"}
          description="No hay resultados para los filtros actuales."
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label} className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                {group.label}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))]">
                {group.items.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} onOpen={handleOpen} />
                ))}
              </div>
            </section>
          ))}

          {query.hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? "Cargando..." : "Cargar más"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
