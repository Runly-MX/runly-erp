import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { native } from "../../../../native";

const POLL_MS = 5000;

// Android app only: the in-call audio output (Teléfono / Altavoz / Audífonos /
// Bluetooth), which the WebView can't choose by itself. Re-reads the routes
// every few seconds so a Bluetooth headset that connects mid-call shows up.
// Returns { supported: false } everywhere else.
export function useAudioRoute({ enabled = true } = {}) {
  const [state, setState] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setState((await native.audioRoute.list()) ?? null);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  const select = useCallback(async (id) => {
    try {
      const next = await native.audioRoute.set(id);
      if (next) setState(next);
    } catch (error) {
      toast.error(error?.message || "No se pudo cambiar la salida de audio.");
    }
  }, []);

  if (!state?.routes?.length) return { supported: false };
  return { supported: true, routes: state.routes, active: state.active ?? null, select };
}
