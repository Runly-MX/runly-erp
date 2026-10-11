import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useNavigate } from 'react-router-dom';
import { native } from '../../../native/index.js';
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import {
  requestDesktopAttention,
  showSystemNotification,
} from "../../../lib/systemNotifications";
import { useRealtimeContext } from "../../../providers/RealtimeProvider";
import { playCallSound, playCallEndSound, unlockCallSounds } from "./callSounds";
import {
  claimCallForDevice,
  releaseCallForDevice,
  shouldResumeCallOnDevice,
} from "./callDeviceSession";
import { useCallSynchronization } from "./useCallSynchronization";
import { IncomingCallDialog } from "./IncomingCallDialog";
import { acquireRingLock, refreshRingLock, releaseRingLock, ringLockIsMine } from "./callRingLock";

const CallRoom = lazy(() =>
  import("./CallRoom").then((module) => ({ default: module.CallRoom })),
);

const CallsContext = createContext(null);

function unwrap(response) {
  return response?.data ?? response;
}

async function dismissSystemCallNotification(callId) {
  if (callId && native.isMobile()) return native.notifications.dismiss(`call:${callId}`);
  if (!callId || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const notifications = await registration?.getNotifications?.({ tag: `call:${callId}` });
  notifications?.forEach((notification) => notification.close());
}

export function CallsProvider({ children }) {
  const navigate = useNavigate();
  const { session, userProfile } = useAuth();
  const { on } = useRealtimeContext();
  const [config, setConfig] = useState({ enabled: false, mode: "disabled", loading: true });
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const activeRef = useRef(null);
  const incomingRef = useRef(null);
  const joiningCallRef = useRef(null);
  const startingCallRef = useRef(false);
  const busyNoticeRef = useRef(new Set());
  const [pendingGuestCount, setPendingGuestCount] = useState(0);
  // Bumped by the lobby toast's "Ver solicitudes" action; CallRoom watches it
  // and opens the guest sheet in place (no navigation, no unmount).
  const [guestPanelNonce, setGuestPanelNonce] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [openRecordingsFor, setOpenRecordingsFor] = useState(null); // conversationId or null
  const requestOpenRecordings = useCallback((conversationId) => setOpenRecordingsFor(conversationId), []);
  const clearOpenRecordingsRequest = useCallback(() => setOpenRecordingsFor(null), []);

  useEffect(() => {
    activeRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    incomingRef.current = incomingCall;
  }, [incomingCall]);

  const token = session?.access_token;

  // Calls in which a recording was seen live (CallRoom reports it), so the
  // end-of-call summary can offer "Ver grabación".
  const recordedCallsRef = useRef(new Set());
  const markRecorded = useCallback((callId) => { if (callId) recordedCallsRef.current.add(callId); }, []);

  // End-of-call summary: duration + the most useful next step.
  const showCallSummary = useCallback((session, fallbackMessage) => {
    const call = session?.call;
    const startedRaw = call?.startedAt ?? call?.createdAt;
    const startedAt = startedRaw ? new Date(startedRaw).getTime() : null;
    const seconds = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    if (!call || seconds < 30) {
      if (fallbackMessage) toast.info(fallbackMessage);
      return;
    }
    const minutes = Math.max(1, Math.round(seconds / 60));
    const label = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
    const recorded = recordedCallsRef.current.has(call.id);
    recordedCallsRef.current.delete(call.id);
    const conversationId = call.conversationId;
    toast.success(`${call.kind === "AUDIO" ? "Llamada" : "Reunión"} finalizada · ${label}`, {
      description: recorded ? "La grabación estará lista en unos minutos." : undefined,
      duration: 8000,
      action: conversationId ? {
        label: recorded ? "Ver grabación" : "Ir al chat",
        onClick: () => {
          navigate(`/app/m/runly.chat/chat/inbox/${encodeURIComponent(conversationId)}`);
          if (recorded) setOpenRecordingsFor(conversationId);
        },
      } : undefined,
    });
  }, [navigate]);

  const finishLocalCall = useCallback((callId, message = "La llamada ha terminado.") => {
    if (!callId) return false;
    const matchesIncoming = incomingRef.current?.id === callId;
    const matchesActive = activeRef.current?.call?.id === callId;
    if (!matchesIncoming && !matchesActive) return false;
    const endedSession = matchesActive ? activeRef.current : null;
    incomingRef.current = null;
    activeRef.current = null;
    setIncomingCall(null);
    setActiveSession(null);
    playCallEndSound();
    dismissSystemCallNotification(callId).catch(() => {});
    releaseCallForDevice(callId);
    if (endedSession && message === "La llamada ha terminado.") showCallSummary(endedSession, message);
    else toast.info(message);
    return true;
  }, [showCallSummary]);

  useEffect(() => {
    if (!incomingCall?.id) return undefined;
    const callId = incomingCall.id;
    const soundToastId = `call-sound-blocked:${callId}`;
    let disposed = false;
    let stopSound = () => {};
    let gestureRetryArmed = false;

    // Ring in ONE tab of this browser only.
    if (!acquireRingLock(callId)) return undefined;
    const heartbeat = setInterval(() => { if (!disposed) refreshRingLock(callId); }, 2000);
    const onStorage = () => {
      if (!disposed && !ringLockIsMine(callId)) stopSound();
    };
    window.addEventListener("storage", onStorage);

    // iOS PWAs block the ringtone until a real tap, and the toast's "Activar
    // sonido" button is a tiny target. Retry from the FIRST tap anywhere in the
    // app — synchronously, so the <audio>.play() counts as user-activated.
    function retryOnGesture() {
      document.removeEventListener("touchend", retryOnGesture, true);
      document.removeEventListener("click", retryOnGesture, true);
      gestureRetryArmed = false;
      if (disposed || incomingRef.current?.id !== callId) return;
      toast.dismiss(soundToastId);
      startRingtone();
      unlockCallSounds().catch(() => {});
    }
    function armGestureRetry() {
      if (gestureRetryArmed) return;
      gestureRetryArmed = true;
      document.addEventListener("touchend", retryOnGesture, true);
      document.addEventListener("click", retryOnGesture, true);
    }
    function disarmGestureRetry() {
      if (!gestureRetryArmed) return;
      document.removeEventListener("touchend", retryOnGesture, true);
      document.removeEventListener("click", retryOnGesture, true);
      gestureRetryArmed = false;
    }

    function startRingtone() {
      stopSound();
      stopSound = playCallSound("ringtone", {
        loop: true,
        volume: 0.65,
        onBlocked: () => {
          if (disposed) return;
          armGestureRetry();
          toast.warning("El telefono bloqueo el sonido de la llamada", {
            id: soundToastId,
            description: "Toca el boton para escuchar el tono.",
            duration: Infinity,
            action: {
              label: "Activar sonido",
              onClick: () => {
                if (disposed || incomingRef.current?.id !== callId) return;
                // Restart the ringtone element synchronously inside this tap so
                // iOS treats the <audio>.play() as user-activated — do NOT wait
                // on unlockCallSounds()'s boolean (it can report false on iOS
                // even when the element is now playable, which left the button
                // doing nothing). Kick the AudioContext in parallel.
                toast.dismiss(soundToastId);
                startRingtone();
                unlockCallSounds().catch(() => {});
              },
            },
          });
        },
      });
    }

    startRingtone();
    return () => {
      disposed = true;
      stopSound();
      disarmGestureRetry();
      clearInterval(heartbeat);
      window.removeEventListener("storage", onStorage);
      releaseRingLock(callId);
      toast.dismiss(soundToastId);
    };
  }, [incomingCall?.id]);

  const fetchCall = useCallback(async (callId) => {
    const response = await runly.calls.get(callId, token);
    return unwrap(response);
  }, [token]);

  const connectWithResponse = useCallback((response, extra = null) => {
    const raw = unwrap(response);
    if (!raw?.call || !raw?.token || !raw?.livekitUrl) return false;
    // Client-only session flags (e.g. meetingMode) survive a token refresh
    // for the same call (rejoin after a dropped connection).
    const previous = activeRef.current?.call?.id === raw.call.id ? activeRef.current : null;
    const payload = {
      ...raw,
      meetingMode: extra?.meetingMode ?? previous?.meetingMode ?? null,
      joinPrefs: extra?.joinPrefs ?? previous?.joinPrefs ?? null,
    };
    incomingRef.current = null;
    setIncomingCall(null);
    setActiveSession(payload);
    activeRef.current = payload;
    dismissSystemCallNotification(payload.call.id).catch(() => {});
    claimCallForDevice(payload.callId ?? payload.call.id);
    return true;
  }, []);

  const dismissAnsweredOnOtherDevice = useCallback((callId) => {
    if (!callId || activeRef.current?.call?.id === callId) return false;
    const wasIncoming = incomingRef.current?.id === callId;
    if (wasIncoming) {
      incomingRef.current = null;
      setIncomingCall(null);
      toast.info("La llamada fue contestada en otro dispositivo.");
    }
    releaseCallForDevice(callId);
    dismissSystemCallNotification(callId).catch(() => {});
    return wasIncoming;
  }, []);

  const rejectIncomingWhileBusy = useCallback((callId) => {
    const activeCallId = activeRef.current?.call?.id;
    if (!callId || !activeCallId || callId === activeCallId) return false;
    if (busyNoticeRef.current.has(callId)) return true;
    if (busyNoticeRef.current.size > 100) busyNoticeRef.current.clear();
    busyNoticeRef.current.add(callId);
    toast.info("Otra persona intento llamarte mientras estabas ocupado.");
    runly.calls.decline(callId, token).catch(() => {});
    return true;
  }, [token]);

  const presentIncomingCall = useCallback((call) => {
    if (!call?.id || call.status === "ENDED" || call.initiatedByUserId === userProfile?.id) return;
    // Already connected to THIS call — a stale RINGING postgres_changes row or
    // a poll that lands right after you answer must not re-open the incoming
    // dialog, which restarts its looping ringtone over the CallRoom's own
    // "join" sound. (rejectIncomingWhileBusy deliberately returns false for
    // callId === activeCallId, so it can't catch this case.)
    if (activeRef.current?.call?.id === call.id) return;
    if (rejectIncomingWhileBusy(call.id)) return;
    const isNewCall = incomingRef.current?.id !== call.id;
    incomingRef.current = call;
    setIncomingCall(call);
    if (isNewCall) {
      globalThis.navigator?.vibrate?.([400, 180, 400, 180, 400]);
      requestDesktopAttention().catch(() => {});
      showSystemNotification({
        title: call.initiator?.displayName ?? "Llamada entrante",
        body: call.kind === "VIDEO" ? "Videollamada entrante" : "Llamada entrante",
        tag: `call:${call.id}`,
        data: {
          link: call.conversationId
            ? `/app/m/runly.chat/chat/inbox/${call.conversationId}`
            : "/app/m/runly.chat/chat/inbox",
          callId: call.id,
        },
        requireInteraction: true,
      }).catch(() => {});
    }
  }, [userProfile?.id, rejectIncomingWhileBusy]);

  const syncCurrentCall = useCallback(async () => {
    if (!token || !userProfile?.id) return null;
    const current = unwrap(await runly.calls.getCurrent(token));
    if (!current?.call) {
      if (incomingRef.current) {
        dismissSystemCallNotification(incomingRef.current.id).catch(() => {});
        incomingRef.current = null;
        setIncomingCall(null);
      }
      if (!activeRef.current) releaseCallForDevice();
      return null;
    }
    if (
      current.participantStatus === "RINGING"
      && current.call.initiatedByUserId !== userProfile.id
      && !activeRef.current
    ) {
      presentIncomingCall(current.call);
      return current;
    }
    if (current.participantStatus === "JOINED" && !activeRef.current) {
      if (!shouldResumeCallOnDevice(current.call.id, current.participantStatus)) {
        dismissAnsweredOnOtherDevice(current.call.id);
        return current;
      }
      if (joiningCallRef.current === current.call.id) return current;
      joiningCallRef.current = current.call.id;
      try {
        connectWithResponse(await runly.calls.join(current.call.id, token));
      } finally {
        joiningCallRef.current = null;
      }
    }
    return current;
  }, [token, userProfile?.id, presentIncomingCall, connectWithResponse, dismissAnsweredOnOtherDevice]);

  useEffect(() => {
    if (!token || !userProfile?.id) return undefined;
    let cancelled = false;
    let retryTimer = null;

    async function bootstrap(attempt = 0) {
      try {
        const status = unwrap(await runly.calls.getConfig(token));
        if (cancelled) return;
        setConfig({ ...status, loading: false });
        if (status?.enabled) await syncCurrentCall();
      } catch (error) {
        if (cancelled) return;
        setConfig({ enabled: false, mode: "unavailable", loading: false });
        if (attempt === 0) console.warn("[atlas.calls] Configuracion no disponible; se reintentara.", error);
        const delay = Math.min(1_000 * (2 ** attempt), 30_000);
        retryTimer = window.setTimeout(() => bootstrap(attempt + 1), delay);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [token, userProfile?.id, syncCurrentCall]);

  useEffect(() => {
    if (!token || !userProfile?.id) return undefined;
    return native.events.subscribe(async (event) => {
      if (event.kind === 'chat') {
        navigate(`/app/m/runly.chat/chat/inbox/${encodeURIComponent(event.targetId)}`);
        return true;
      }
      if (config.loading || config.mode === 'unavailable') return false;
      if (!config.enabled) {
        toast.error('Las llamadas no están disponibles en esta instancia.');
        return true;
      }
      try {
        // Reconcile authoritative participant state; a deep link never accepts a call.
        await fetchCall(event.targetId);
        await syncCurrentCall();
        return true;
      } catch (error) {
        if ([403, 404].includes(error?.status)) {
          toast.error('La llamada ya no está disponible.');
          return true;
        }
        return false;
      }
    });
  }, [token, userProfile?.id, config.loading, config.mode, config.enabled, navigate, fetchCall, syncCurrentCall]);

  useCallSynchronization({
    enabled: config.enabled,
    token,
    userId: userProfile?.id,
    activeCallId: activeSession?.call?.id,
    incomingCallId: incomingCall?.id,
    onRealtime: on,
    syncCurrentCall,
    fetchCall,
    presentIncomingCall,
    rejectIncomingWhileBusy,
    finishLocalCall,
    dismissAnsweredOnOtherDevice,
  });

  // ring=false starts a meeting without ringing anyone; meetingMode
  // "inperson" opens the in-person recorder view and records automatically.
  const startCall = useCallback(async ({ conversationId, kind, calendarEventId, ring, meetingMode = null, throwOnError = false }) => {
    if (!config.enabled || isStarting || startingCallRef.current || activeRef.current) {
      const error = Object.assign(new Error(
        !config.enabled ? "Las llamadas no están disponibles."
          : activeRef.current ? "Ya tienes una llamada en curso."
            : "Ya se está iniciando una llamada.",
      ), { status: 409 });
      if (throwOnError) throw error;
      toast.error(error.message);
      return false;
    }
    startingCallRef.current = true;
    setIsStarting(true);
    try {
      const response = await runly.calls.create(
        { conversationId, kind, calendarEventId, ...(ring === false ? { ring: false } : {}) },
        token,
      );
      if (!connectWithResponse(response, { meetingMode })) throw new Error("El servidor no devolvió los datos para entrar a la llamada.");
      return true;
    } catch (error) {
      const details = error?.details?.details ?? error?.details;
      const existingCallId = details?.callId;
      if (error?.status === 409 && existingCallId && details?.code !== "caller_busy") {
        try {
          if (!connectWithResponse(await runly.calls.join(existingCallId, token))) {
            throw new Error("El servidor no devolvió los datos para entrar a la llamada.");
          }
          toast.info("Te uniste a la llamada que ya estaba en curso.");
          return true;
        } catch (joinError) {
          // A call already exists even if joining it fails; keep its room.
          joinError.callMayExist = true;
          if (throwOnError) throw joinError;
          toast.error(joinError?.message || "No se pudo unir a la llamada.");
          return false;
        }
      }
      if (throwOnError) throw error;
      toast.error(error?.message || "No se pudo iniciar la llamada.");
      return false;
    } finally {
      startingCallRef.current = false;
      setIsStarting(false);
    }
  }, [config.enabled, isStarting, token, connectWithResponse]);

  // Join a live call/meeting the user was not rung for ("Unirse" banner).
  // `joinPrefs` ({ mic, camera }) comes from the pre-join check.
  const joinCall = useCallback(async (callId, joinPrefs = null) => {
    if (!callId || activeRef.current || startingCallRef.current) {
      if (activeRef.current) toast.error("Ya tienes una llamada en curso.");
      return false;
    }
    startingCallRef.current = true;
    setIsStarting(true);
    try {
      claimCallForDevice(callId);
      if (!connectWithResponse(await runly.calls.join(callId, token), { joinPrefs })) {
        throw new Error("El servidor no devolvió los datos para entrar a la llamada.");
      }
      return true;
    } catch (error) {
      releaseCallForDevice(callId);
      toast.error(error?.message || "No se pudo unir a la reunión.");
      return false;
    } finally {
      startingCallRef.current = false;
      setIsStarting(false);
    }
  }, [token, connectWithResponse]);

  // `joinPrefs` ({ camera: false }) = "Solo audio" on a video call.
  const acceptIncoming = useCallback(async (joinPrefs = null) => {
    if (!incomingCall?.id) return;
    const callId = incomingCall.id;
    claimCallForDevice(callId);
    joiningCallRef.current = callId;
    setIsStarting(true);
    try {
      connectWithResponse(await runly.calls.join(callId, token), joinPrefs ? { joinPrefs: { mic: true, ...joinPrefs } } : null);
    } catch (error) {
      releaseCallForDevice(callId);
      toast.error(error?.message || "No se pudo contestar la llamada.");
      incomingRef.current = null;
      setIncomingCall(null);
    } finally {
      joiningCallRef.current = null;
      setIsStarting(false);
    }
  }, [incomingCall?.id, token, connectWithResponse]);

  const declineIncoming = useCallback(async () => {
    if (!incomingCall?.id) return;
    const callId = incomingCall.id;
    setIncomingCall(null);
    incomingRef.current = null;
    releaseCallForDevice(callId);
    dismissSystemCallNotification(callId).catch(() => {});
    try {
      await runly.calls.decline(callId, token);
    } catch (error) {
      toast.error(error?.message || "No se pudo rechazar la llamada.");
    }
  }, [incomingCall?.id, token]);

  // "Salir" leaves (a group meeting keeps going without you); "Finalizar
  // para todos" (endForAll, host only) ends it for everyone. An unanswered
  // outgoing call is always ended.
  const leaveActive = useCallback(async ({ unanswered = false, endForAll = false } = {}) => {
    const current = activeRef.current;
    const callId = current?.call?.id;
    const isInitiator = current?.call?.initiatedByUserId === userProfile?.id;
    setActiveSession(null);
    activeRef.current = null;
    releaseCallForDevice(callId);
    if (!callId) return;
    if (!unanswered) showCallSummary(current);
    try {
      if ((endForAll || unanswered) && isInitiator) await runly.calls.end(callId, token);
      else await runly.calls.leave(callId, token);
      if (unanswered) toast.info("Nadie respondio la llamada.");
    } catch (error) {
      toast.error(error?.message || "No se pudo actualizar el estado de la llamada.");
    }
  }, [token, userProfile?.id, showCallSummary]);

  // Fresh LiveKit token for the same call after the connection dropped (device
  // locked/asleep). Same call id -> CallRoom stays mounted and reconnects.
  const rejoinActive = useCallback(async () => {
    const callId = activeRef.current?.call?.id;
    if (!callId) return;
    try {
      if (!connectWithResponse(await runly.calls.join(callId, token))) throw new Error("REJOIN_EMPTY");
    } catch (error) {
      // Ended or we were marked LEFT meanwhile: nothing to rejoin.
      if (error?.status === 409 || error?.status === 404 || error?.status === 403) {
        finishLocalCall(callId);
        return;
      }
      throw error;
    }
  }, [token, connectWithResponse, finishLocalCall]);

  const endUnansweredCall = useCallback(() => {
    leaveActive({ unanswered: true });
  }, [leaveActive]);

  // Guest-lobby realtime events for the active call: keep a rough pending count
  // and toast when someone new is waiting.
  useEffect(() => {
    if (!on) return undefined;
    const bump = () => setPendingGuestCount((n) => n + 1);
    const clear = () => setPendingGuestCount((n) => Math.max(0, n - 1));
    const subs = [
      on("chat.call.guest_waiting", (p) => {
        bump();
        if (activeRef.current?.call?.id === p?.callId) {
          toast.message(`${p?.name ?? "Un invitado"} quiere unirse a la llamada.`, {
            action: {
              label: "Ver solicitudes",
              onClick: () => setGuestPanelNonce((n) => n + 1),
            },
          });
        }
      }),
      on("chat.call.guest_admitted", clear),
      on("chat.call.guest_denied", clear),
      on("chat.call.guest_kicked", clear),
      on("chat.call.guest_left", clear),
    ];
    return () => subs.forEach((u) => u?.());
  }, [on]);

  useEffect(() => {
    if (!activeSession) {
      setPendingGuestCount(0);
      setGuestPanelNonce(0);
      setMinimized(false);
    }
  }, [activeSession]);

  const minimizeCall = useCallback(() => setMinimized(true), []);
  const restoreCall = useCallback(() => setMinimized(false), []);

  const value = useMemo(() => ({
    enabled: config.enabled,
    loading: config.loading,
    isStarting,
    activeCall: activeSession?.call ?? null,
    pendingGuestCount,
    minimized: minimized && Boolean(activeSession),
    minimizeCall,
    restoreCall,
    startCall,
    joinCall,
    openRecordingsFor,
    requestOpenRecordings,
    clearOpenRecordingsRequest,
  }), [config.enabled, config.loading, isStarting, activeSession, pendingGuestCount, minimized, minimizeCall, restoreCall, startCall, joinCall, openRecordingsFor, requestOpenRecordings, clearOpenRecordingsRequest]);

  return (
    <CallsContext.Provider value={value}>
      {children}
      <IncomingCallDialog
        call={incomingCall}
        isStarting={isStarting}
        onAccept={acceptIncoming}
        onDecline={declineIncoming}
      />
      {activeSession && (
        <Suspense fallback={<div className="fixed inset-0 z-[46] bg-slate-950" />}>
          <CallRoom
            key={activeSession.call.id}
            session={activeSession}
            onLeave={leaveActive}
            onUnanswered={endUnansweredCall}
            onReconnect={rejoinActive}
            isInitiator={activeSession.call.initiatedByUserId === userProfile?.id}
            minimized={minimized}
            onMinimize={minimizeCall}
            onRestore={restoreCall}
            guestPanelNonce={guestPanelNonce}
            onRecordingActive={markRecorded}
          />
        </Suspense>
      )}
    </CallsContext.Provider>
  );
}

export function useCalls() {
  const value = useContext(CallsContext);
  if (!value) throw new Error("useCalls must be used inside CallsProvider");
  return value;
}
