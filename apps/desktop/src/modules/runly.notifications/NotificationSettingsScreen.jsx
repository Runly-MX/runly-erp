import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Skeleton,
} from "@runly/ui";
import { BellRing, CalendarClock, CheckSquare2, Globe2, MessageCircle, PhoneCall, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { getDefaultNotificationPreference } from '@runly/core';
import { useAuth } from "../../auth/AuthProvider";
import PushDiagnosticsCard from "./PushDiagnosticsCard";
import { EVENT_CATALOG, fallbackEvent } from "./notificationCatalog";
import NotificationPreferencesPanel from "./NotificationPreferencesPanel";
import DeliveryCheckCard from "./DeliveryCheckCard";
import DigestCard from "./DigestCard";
import QuietHoursCard from "./QuietHoursCard";
import { runly } from "../../lib/runly";
import {
  getCurrentWebPushSubscription,
  getStoredWebPushSubscriptionId,
  isWebPushSupported,
  subscribeCurrentDeviceToWebPush,
  syncCurrentDeviceWebPushSubscription,
  unsubscribeCurrentDeviceFromWebPush,
} from "../../lib/webPush";

export default function NotificationSettingsScreen() {
  const queryClient = useQueryClient();
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const canRead = Boolean(
    userProfile?.isAdmin ||
      (userProfile?.permissions ?? []).includes("notifications.read"),
  );

  const [tab, setTabState] = useState(() => {
    try { return sessionStorage.getItem("notifications.settings.tab") || "events"; } catch { return "events"; }
  });
  const setTab = (value) => {
    setTabState(value);
    try { sessionStorage.setItem("notifications.settings.tab", value); } catch { /* storage unavailable */ }
  };
  const [pendingKey, setPendingKey] = useState(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState("default");
  const [pushSubscriptionId, setPushSubscriptionId] = useState(null);
  const [hasBrowserPushSubscription, setHasBrowserPushSubscription] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const {
    data: preferencesData,
    isError: isPreferencesError,
    isLoading: isPreferencesLoading,
    refetch: refetchPreferences,
  } = useQuery({
    queryKey: ["notification-preferences", token],
    queryFn: () => runly.notifications.listPreferences(token),
    enabled: Boolean(token) && canRead,
  });

  // Checks whether the server has VAPID keys configured.
  // VAPID keys are managed from Atlas Core → Settings → Web Push (not env vars).
  // The endpoint returns 409 with code "web_push_not_configured" when keys are absent.
  const {
    data: vapidConfig,
    isError: vapidError,
    error: vapidErr,
    isLoading: vapidLoading,
  } = useQuery({
    queryKey: ["notifications-webpush-public-key", token],
    queryFn: () => runly.notifications.getWebPushPublicKey(token),
    enabled: Boolean(token) && canRead,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });

  const vapidNotConfigured = vapidError && vapidErr?.status === 409;
  const vapidConfigured = Boolean(vapidConfig?.data?.publicKey);

  const upsertMutation = useMutation({
    mutationFn: (payload) => runly.notifications.upsertPreference(token, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["notification-preferences", token],
      }),
    onError: () => toast.error("No se pudo guardar la preferencia"),
    onSettled: () => setPendingKey(null),
  });

  // Events declared by installed modules (manifest.notificationEvents).
  const { data: declaredEvents } = useQuery({
    queryKey: ["notification-events", token],
    queryFn: () => runly.notifications.listEvents(token),
    enabled: Boolean(token) && canRead,
    staleTime: 5 * 60 * 1000,
  });

  const preferencesMap = useMemo(() => {
    const rows = preferencesData?.data ?? [];
    return new Map(rows.map((row) => [row.eventType, row]));
  }, [preferencesData]);

  const catalogRows = useMemo(() => {
    const declared = (declaredEvents?.data ?? []).map((e) => ({ ...e, icon: BellRing }));
    const known = new Set([...EVENT_CATALOG, ...declared].map((item) => item.eventType));
    const extras = [...preferencesMap.keys()].filter((e) => !known.has(e)).map(fallbackEvent);
    return [...EVENT_CATALOG, ...declared.filter((d) => !EVENT_CATALOG.some((e) => e.eventType === d.eventType)), ...extras];
  }, [preferencesMap, declaredEvents]);

  useEffect(() => {
    let cancelled = false;

    async function loadPushState() {
      const supported = isWebPushSupported();
      if (cancelled) return;
      setPushSupported(supported);
      if (!supported) return;

      setPushPermission(Notification.permission);

      const subscription = await getCurrentWebPushSubscription().catch(() => null);
      if (cancelled) return;

      setHasBrowserPushSubscription(Boolean(subscription));
      setPushSubscriptionId(getStoredWebPushSubscriptionId());

      if (!subscription || !token) return;

      const response = await syncCurrentDeviceWebPushSubscription({
        token,
        deviceLabel: "Dispositivo web",
      }).catch(() => null);
      if (cancelled) return;

      setPushSubscriptionId(
        response?.data?.id ?? getStoredWebPushSubscriptionId() ?? null,
      );
    }

    loadPushState();

    return () => {
      cancelled = true;
    };
  }, [token]);

  function getPreference(eventType) {
    return {
      ...getDefaultNotificationPreference(eventType),
      ...(preferencesMap.get(eventType) ?? {}),
    };
  }

  // Applies one patch to several events (single toggle or bulk group action).
  function updatePreferences(eventTypes, patch) {
    setPendingKey(`${eventTypes[0]}:${Object.keys(patch)[0]}`);
    Promise.all(
      eventTypes.map((eventType) => {
        const current = getPreference(eventType);
        return upsertMutation.mutateAsync({
          eventType,
          inAppEnabled: current.inAppEnabled,
          emailEnabled: current.emailEnabled,
          pushEnabled: current.pushEnabled,
          ...patch,
        });
      }),
    ).catch(() => {});
  }

  async function handleSubscribeCurrentDevice() {
    if (!token) return;
    setPushBusy(true);
    try {
      const response = await subscribeCurrentDeviceToWebPush({
        token,
        deviceLabel: "Dispositivo web",
      });
      setPushPermission(Notification.permission);
      setHasBrowserPushSubscription(true);
      setPushSubscriptionId(response?.data?.id ?? getStoredWebPushSubscriptionId());
      toast.success("Push web activado en este dispositivo.");
    } catch (err) {
      toast.error(err?.message ?? "No se pudo activar push web.");
    } finally {
      setPushBusy(false);
    }
  }

  async function handleUnsubscribeCurrentDevice() {
    if (!token) return;
    setPushBusy(true);
    try {
      await unsubscribeCurrentDeviceFromWebPush({ token });
      setHasBrowserPushSubscription(false);
      setPushSubscriptionId(null);
      setPushPermission(
        typeof Notification === "undefined" ? "default" : Notification.permission,
      );
      toast.success("Push web desactivado en este dispositivo.");
    } catch (err) {
      toast.error(err?.message ?? "No se pudo desactivar push web.");
    } finally {
      setPushBusy(false);
    }
  }

  if (!canRead) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader
          eyebrow="Runly Notifications"
          title="Configuracion de notificaciones"
          description="Define por que canales quieres recibir alertas."
        />
        <ErrorState message="No tienes permisos para configurar notificaciones." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        eyebrow="Runly Notifications"
        title="Configuracion"
        description="Controla que eventos reciben notificacion en plataforma, correo y push."
      />

      <SegmentedControl
        ariaLabel="Secciones de notificaciones"
        size="lg"
        variant="subtle"
        value={tab}
        onChange={setTab}
        options={[
          { value: "events", label: "Eventos" },
          { value: "schedule", label: "Horarios" },
          { value: "devices", label: "Dispositivos" },
        ]}
      />
      {tab === "events" && (
      <NotificationPreferencesPanel
        rows={catalogRows}
        getPreference={getPreference}
        pendingKey={pendingKey}
        onChange={updatePreferences}
        isLoading={isPreferencesLoading}
        isError={isPreferencesError}
        onRetry={() => refetchPreferences()}
      />
      )}
      {tab === "schedule" && (
        <>
          <QuietHoursCard />
          <DigestCard token={token} />
        </>
      )}
      {tab === "devices" && (
        <>
      <Card>
        <CardHeader>
          <CardTitle>Push web en este dispositivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Activa notificaciones para recibir alertas en segundo plano cuando uses la PWA.
          </p>
          {vapidLoading ? (
            <Skeleton className="h-10 w-full rounded-lg" />
          ) : vapidNotConfigured ? (
            <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
              Push no disponible en este servidor — contacta al administrador para configurar VAPID.
            </div>
          ) : !pushSupported ? (
            <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
              Este navegador no soporta Web Push.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
                Estado del permiso:{" "}
                <span className="font-medium text-[hsl(var(--foreground))]">
                  {pushPermission === "granted"
                    ? "Permitido"
                    : pushPermission === "denied"
                      ? "Bloqueado"
                    : "Pendiente"}
                </span>
                <span className="mx-2">·</span>
                Suscripcion del navegador:{" "}
                <span className="font-medium text-[hsl(var(--foreground))]">
                  {hasBrowserPushSubscription ? "Activa" : "No activa"}
                </span>
              </div>
              {pushPermission === "granted" && !hasBrowserPushSubscription ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                  Este Chrome tiene permiso, pero no una suscripcion push activa. Vuelve a suscribirte en este dispositivo.
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-11 sm:min-h-0"
                  onClick={handleSubscribeCurrentDevice}
                  disabled={pushBusy || pushPermission === "denied"}
                >
                  {pushBusy ? "Procesando..." : "Suscribirme a push"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 sm:min-h-0"
                  onClick={handleUnsubscribeCurrentDevice}
                  disabled={
                    pushBusy || (!hasBrowserPushSubscription && !pushSubscriptionId)
                  }
                >
                  {pushBusy ? "Procesando..." : "Desuscribirme"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
          <DeliveryCheckCard token={token} />
          <PushDiagnosticsCard token={token} />
        </>
      )}
    </div>
  );
}
