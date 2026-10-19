import { runly } from "./runly.js";
import { native } from "../native/index.js";

const STORAGE_KEY = "runly.notifications.fcm.token";

export function getStoredFcmToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function clearStoredFcmToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

// Registers this device's current FCM token with the server if it hasn't
// been registered yet (or has rotated since the last sync). No-ops on
// anything that isn't the native Android app — FCM is Android-only for now.
const SYNC_LOG_KEY = "runly.notifications.fcm.lastSync";

// Last FCM registration attempt, shown in the push diagnostics report.
function recordSync(result) {
  try {
    window.localStorage.setItem(SYNC_LOG_KEY, JSON.stringify({ at: new Date().toISOString(), ...result }));
  } catch {
    // storage unavailable: diagnostics just won't have it
  }
}

export function getLastFcmSync() {
  try {
    return JSON.parse(window.localStorage.getItem(SYNC_LOG_KEY) ?? "null");
  } catch {
    return null;
  }
}

export async function syncCurrentDeviceFcmToken({ authToken, deviceLabel = "Android" }) {
  if (!native.isMobile()) {
    recordSync({ ok: false, step: "no_native_mobile" });
    return { data: null };
  }
  let fcmToken = null;
  try {
    fcmToken = await native.notifications.getPushToken();
  } catch (error) {
    recordSync({ ok: false, step: "get_token_failed", error: String(error?.message ?? error) });
    throw error;
  }
  if (!fcmToken) {
    recordSync({ ok: false, step: "no_token_from_device" });
    return { data: null };
  }

  try {
    const response = await runly.notifications.subscribeFcm(authToken, { token: fcmToken, deviceLabel });
    window.localStorage.setItem(STORAGE_KEY, fcmToken);
    recordSync({ ok: true, step: "registered" });
    return response;
  } catch (error) {
    recordSync({ ok: false, step: "server_rejected", error: String(error?.message ?? error) });
    throw error;
  }
}
