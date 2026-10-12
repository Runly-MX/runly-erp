import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";

function unwrap(r) { return r?.data ?? r; }
const ACTIVE = new Set(["STARTING", "ACTIVE"]);

// Polls for the currently-active recording of this call's conversation (if
// any) every 5s while the call is open, and exposes start/stop actions.
export function useCallRecording({ callId, conversationId, getOrientation = null }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [activeRecording, setActiveRecording] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    if (!conversationId || !token) return;
    try {
      const res = unwrap(await runly.calls.listRecordings(conversationId, token));
      setActiveRecording((res ?? []).find((r) => ACTIVE.has(r.status)) ?? null);
    } catch { /* transient — next poll retries */ }
  }, [conversationId, token]);

  useEffect(() => {
    if (!conversationId || !token) return undefined;
    refresh();
    timer.current = setInterval(refresh, 5000);
    return () => clearInterval(timer.current);
  }, [conversationId, token, refresh]);

  // `getOrientation` (optional) returns "portrait" | "landscape" for the
  // recording canvas, read at the moment the recording starts.
  const start = useCallback(async () => {
    setBusy(true);
    try {
      await runly.calls.startRecording(callId, token, { orientation: getOrientation?.() });
      await refresh();
    } catch (e) {
      toast.error(e?.message || "No se pudo iniciar la grabación.");
    } finally {
      setBusy(false);
    }
  }, [callId, token, refresh, getOrientation]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      await runly.calls.stopRecording(callId, token);
      await refresh();
    } catch (e) {
      toast.error(e?.message || "No se pudo detener la grabación.");
    } finally {
      setBusy(false);
    }
  }, [callId, token, refresh]);

  return { active: Boolean(activeRecording), current: activeRecording, busy, start, stop };
}
