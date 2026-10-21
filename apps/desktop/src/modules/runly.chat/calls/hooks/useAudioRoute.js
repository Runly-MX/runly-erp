import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { native } from "../../../../native";
import { defaultRouteId } from "../lib/audioRoutes";

const POLL_MS = 3000;

// Android app only: the in-call audio output (Teléfono / Altavoz / Audífonos /
// Bluetooth), which the WebView can't choose by itself. Starts the call on a
// sensible route, re-applies the chosen one if the system or WebView drifts
// away from it, and blanks the screen near the ear (voice call on the
// earpiece). Hands the audio back to the system when the call ends.
// Returns { supported: false } everywhere else.
export function useAudioRoute({ enabled = true, video = false } = {}) {
  const [state, setState] = useState(null);
  const desiredRef = useRef(null);
  const videoRef = useRef(video);
  videoRef.current = video;

  const apply = useCallback(async (id) => {
    const next = await native.audioRoute.set(id);
    if (next) setState(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = (await native.audioRoute.list()) ?? null;
      setState(next);
      const routes = next?.routes ?? [];
      if (!routes.length) return;
      if (!desiredRef.current) desiredRef.current = defaultRouteId(routes, videoRef.current);
      const desired = desiredRef.current;
      if (desired && next.active !== desired && routes.some((r) => r.id === desired)) {
        await apply(desired).catch(() => {});
      }
    } catch {
      setState(null);
    }
  }, [apply]);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  const supported = Boolean(state?.routes?.length);
  const active = state?.active ?? null;
  const nearEar = enabled && supported && active === "earpiece" && !video;
  useEffect(() => {
    native.proximity.set(nearEar).catch(() => {});
  }, [nearEar]);

  useEffect(() => () => {
    native.proximity.set(false).catch(() => {});
    native.audioRoute.reset().catch(() => {});
  }, []);

  const select = useCallback(async (id) => {
    desiredRef.current = id;
    try {
      await apply(id);
    } catch (error) {
      toast.error(error?.message || "No se pudo cambiar la salida de audio.");
    }
  }, [apply]);

  if (!supported) return { supported: false };
  return { supported: true, routes: state.routes, active, select };
}
