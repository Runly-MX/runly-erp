import { native } from "../native/index.js";
import { getLastFcmSync, getStoredFcmToken } from "./fcm.js";
import { getStoredWebPushSubscriptionId, isWebPushSupported } from "./webPush.js";
import { isTauriRuntime } from "./systemNotifications.js";

async function collectServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return { supported: false };
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return { supported: true, registered: false };
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    let pushSubscribed = null;
    try {
      pushSubscribed = Boolean(await registration.pushManager?.getSubscription());
    } catch {
      pushSubscribed = null;
    }
    return { supported: true, registered: true, scope: registration.scope, state: worker?.state ?? null, pushSubscribed };
  } catch (error) {
    return { supported: true, error: String(error?.message ?? error) };
  }
}

// What this device knows about its own push setup (no secrets).
export async function collectClientPushState() {
  const standalone =
    typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  return {
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    secureContext: typeof window !== "undefined" ? window.isSecureContext : null,
    runtime: isTauriRuntime() ? "app nativa (Tauri/APK)" : standalone ? "PWA instalada" : "navegador",
    nativeMobile: Boolean(native.isMobile?.()),
    notificationPermission: typeof Notification !== "undefined" ? Notification.permission : "no soportado",
    webPushSupported: isWebPushSupported(),
    storedWebPushSubscriptionId: getStoredWebPushSubscriptionId() ?? null,
    hasStoredFcmToken: Boolean(getStoredFcmToken()),
    lastFcmSync: getLastFcmSync(),
    serviceWorker: await collectServiceWorker(),
  };
}

function line(label, value) {
  return `${label}: ${value === null || value === undefined || value === "" ? "-" : value}`;
}

const yesNo = (value) => (value ? "si" : "no");

// Plain-text report meant to be pasted into a support chat.
export function formatPushReport({ client, server }) {
  const out = ["== Diagnostico de notificaciones push ==", `Generado: ${new Date().toISOString()}`, ""];

  out.push("-- Este dispositivo --");
  out.push(line("Entorno", client.runtime));
  out.push(line("Movil nativo", yesNo(client.nativeMobile)));
  out.push(line("Permiso de notificaciones", client.notificationPermission));
  out.push(line("Push web soportado", yesNo(client.webPushSupported)));
  out.push(line("Contexto seguro (https)", yesNo(client.secureContext)));
  out.push(line("En linea", yesNo(client.online)));
  out.push(line("Suscripcion web guardada localmente", client.storedWebPushSubscriptionId));
  out.push(line("Token FCM guardado localmente", yesNo(client.hasStoredFcmToken)));
  const sync = client.lastFcmSync;
  out.push(
    line(
      "Ultimo registro FCM",
      sync ? `${sync.at} ok=${yesNo(sync.ok)} paso=${sync.step}${sync.error ? ` error=${sync.error}` : ""}` : "nunca intentado",
    ),
  );
  const sw = client.serviceWorker;
  out.push(
    line(
      "Service worker",
      !sw.supported ? "no soportado" : sw.registered ? `${sw.state} (push suscrito: ${sw.pushSubscribed})` : sw.error ?? "sin registrar",
    ),
  );
  out.push(line("User agent", client.userAgent));
  out.push("");

  if (!server) {
    out.push("-- Servidor --", "No se pudo consultar al servidor.");
    return out.join("\n");
  }

  out.push("-- Servidor --");
  out.push(line("VAPID configurado (push web)", yesNo(server.server?.vapidConfigured)));
  out.push(line("FCM habilitado (flag)", yesNo(server.server?.fcmEnabledFlag)));
  out.push(line("Credenciales FCM montadas", yesNo(server.server?.fcmCredentialsConfigured)));
  out.push("");

  out.push(`-- Suscripciones web push de tu usuario (${server.webPushSubscriptions?.length ?? 0}) --`);
  for (const sub of server.webPushSubscriptions ?? []) {
    out.push(
      `* ${sub.enabled ? "activa" : "DESACTIVADA"} | ${sub.device ?? "sin etiqueta"} | servicio=${sub.pushService} | visto=${sub.lastSeenAt ?? "nunca"} | creada=${sub.createdAt}`,
    );
  }
  out.push("");

  out.push(`-- Tokens FCM de tu usuario (${server.fcmTokens?.length ?? 0}) --`);
  for (const t of server.fcmTokens ?? []) {
    out.push(
      `* ${t.enabled ? "activo" : "DESACTIVADO"} | ${t.device ?? "sin etiqueta"} | ...${t.tokenTail} | visto=${t.lastSeenAt ?? "nunca"} | creado=${t.createdAt}`,
    );
  }
  out.push("");

  out.push("-- Push por tipo de evento --");
  for (const pref of server.effectivePreferences ?? []) {
    out.push(
      `* ${pref.eventType}: push=${yesNo(pref.push)} (${pref.savedByUser ? "elegido por ti" : "por defecto"})${pref.mutedUntil ? ` silenciado hasta ${pref.mutedUntil}` : ""}`,
    );
  }
  out.push("");

  out.push("-- Ultimos envios push --");
  if (!server.recentDeliveries?.length) out.push("(ninguno: no se ha generado ningun envio para tu usuario)");
  for (const d of server.recentDeliveries ?? []) {
    out.push(
      `* ${d.createdAt} | ${d.eventType} | ${d.channel} | ${d.status} | intentos=${d.attempts}${d.error ? ` | error=${d.error}` : ""}`,
    );
  }
  return out.join("\n");
}
