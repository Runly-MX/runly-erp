self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
  }
});

function broadcastToClients(message) {
  return clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windows) => {
      for (const client of windows) {
        client.postMessage(message);
      }
    });
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload?.title || "Runly Notifications";
  const isIncomingCall = payload?.data?.eventType === "chat.call.incoming";
  const link =
    payload?.data?.link || payload?.link || "/app/m/runly.notifications";
  const options = {
    body: payload?.body || "",
    icon: payload?.icon || "/icon-192.png",
    badge: payload?.badge || "/icon-192.png",
    tag: payload?.tag,
    // Only re-alert for incoming calls. For chat and everything else a repeat
    // push with the same tag should replace the existing notification silently
    // (rapid renotify reads as spam and iOS stacks each buzz separately).
    renotify: isIncomingCall,
    requireInteraction: isIncomingCall,
    vibrate: isIncomingCall ? [500, 200, 500, 200, 500] : undefined,
    actions: isIncomingCall ? [{ action: "open-call", title: "Contestar" }] : undefined,
    data: {
      ...(payload?.data || {}),
      link,
    },
  };

  event.waitUntil(
    Promise.all([
      broadcastToClients({
        type: "runly.notifications.push",
        title,
        body: options.body,
        link,
        notificationId: payload?.data?.notificationId ?? null,
        eventType: payload?.data?.eventType ?? null,
        dedupeKey: payload?.data?.dedupeKey ?? null,
        count: payload?.data?.metadata?.count ?? 1,
        callId: payload?.data?.metadata?.callId ?? payload?.data?.sourceId ?? null,
      }),
      self.registration.showNotification(title, options),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification?.data?.link || "/app/m/runly.notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.postMessage({ type: "runly.notifications.click", link });
          if (new URL(client.url).origin === self.location.origin) {
            client.navigate(link);
            return client.focus();
          }
        }
      }
      return clients.openWindow(link);
    }),
  );
});
