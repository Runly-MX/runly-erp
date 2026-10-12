import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { cn, useCoarsePointer, Sheet, SheetContent, SheetTitle, SheetDescription } from "@runly/ui";
import { Camera, CameraOff, Hand, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, ScreenShareOff, SmilePlus, X } from "lucide-react";
import { GuestRoomChat } from "./GuestRoomChat";
import { useGuestChatUpload } from "./useGuestChatUpload";
import { useCallEphemeral } from "../hooks/useCallEphemeral";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import { useMediaDevices, roomDeviceDefaults } from "../hooks/useMediaDevices";
import { useFocusedSpeaker } from "../hooks/useFocusedSpeaker";
import { CallReactionsOverlay } from "../CallReactionsOverlay";
import { CallStage } from "../layout/CallStage";
import { CallTopBar, MobileCallTopBar } from "../layout/CallTopBar";
import { DockButton, DockSplitButton, MobileCallButton } from "../ui/DockButton";
import { ReactionPopover } from "../controls/ReactionPopover";
import { MicDeviceMenu, CameraDeviceMenu } from "../controls/DeviceMenus";
import { resolveCallView, resolveViewport } from "../lib/callViewMode";
import "../ui/call-ui.css";

function RemoteAudio({ participant }) {
  const ref = useRef(null);
  const pub = participant?.getTrackPublication?.(Track.Source.Microphone);
  const track = pub?.track;
  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return undefined;
    track.attach(el);
    return () => track.detach(el);
  }, [track]);
  // react-doctor-disable-next-line media-has-caption no-autoplay-without-muted -- live call audio after the guest joined.
  return <audio ref={ref} autoPlay />;
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

const hasLiveTrack = (participant, source) => {
  const pub = participant?.getTrackPublication?.(source);
  return Boolean(pub?.track && !pub.isMuted);
};

// External guest's call room: the same stage and controls as members, minus
// moderation and the people roster (guests only see who is on screen).
export function GuestCallRoom({
  fetchLivekitToken, messages, onSendMessage, onLeave, myName, recordingActive = false,
  presignAttachment, getAttachmentUrl, title = "Reunión", initialMic = true, initialCamera = false,
}) {
  useScreenWakeLock(true);
  const { width, height } = useWindowSize();
  const coarse = useCoarsePointer();
  const viewport = resolveViewport({ width, height, coarse });
  const isPhone = viewport === "phone" || viewport === "phone-landscape";
  const landscape = viewport === "phone-landscape";
  const { uploadFile } = useGuestChatUpload(presignAttachment);
  const room = useMemo(() => new Room({ adaptiveStream: true, dynacast: true, ...roomDeviceDefaults() }), []);
  const [, force] = useState(0);
  const [connected, setConnected] = useState(false);
  const [mic, setMic] = useState(initialMic);
  const [cam, setCam] = useState(initialCamera);
  const [screen, setScreen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [live, setLive] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [pinnedIdentity, setPinnedIdentity] = useState(null);
  const setPinned = useCallback((id) => setPinnedIdentity((cur) => (id && cur === id ? null : id || null)), []);
  const [directSwapped, setDirectSwapped] = useState(false);
  const [activeScreen, setActiveScreen] = useState(null);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const refresh = useCallback(() => force((n) => n + 1), []);
  const mediaDevices = useMediaDevices(room, { enabled: connected });

  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const onData = (payload, participant) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg?.type !== "chat") return;
        setLive((p) => [...p.slice(-199), {
          body: msg.body,
          senderName: msg.senderName,
          senderKind: participant?.identity?.startsWith?.("guest_") ? "guest" : "user",
          createdAt: msg.createdAt ?? new Date().toISOString(),
        }]);
      } catch { /* ignore */ }
    };
    const events = [
      RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed,
      RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.ActiveSpeakersChanged,
      RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ConnectionQualityChanged,
    ];
    events.forEach((e) => room.on(e, refresh));
    room.on(RoomEvent.DataReceived, onData);

    (async () => {
      try {
        const { livekitUrl, token } = await fetchLivekitToken();
        if (cancelled) return;
        await room.connect(livekitUrl, token);
        setConnected(true);
        if (initialMic) await room.localParticipant.setMicrophoneEnabled(true);
        if (initialCamera) await room.localParticipant.setCameraEnabled(true).catch(() => setCam(false));
        await room.startAudio().catch(() => {});
        refresh();
      } catch { /* surfaced by the parent poll (KICKED / not live) */ }
    })();

    return () => {
      cancelled = true;
      events.forEach((e) => room.off(e, refresh));
      room.off(RoomEvent.DataReceived, onData);
      room.disconnect();
    };
  }, [room, fetchLivekitToken, refresh]);

  const allRemote = Array.from(room.remoteParticipants.values());
  const remote = allRemote.filter((p) => !p.identity?.startsWith("screen:"));
  const localEntry = { participant: room.localParticipant, isLocal: true };
  const participants = [localEntry, ...remote.map((participant) => ({ participant, isLocal: false }))];
  const screenEntries = [
    ...participants,
    ...allRemote.filter((p) => p.identity?.startsWith("screen:")).map((participant) => ({ participant, isLocal: false })),
  ].filter(({ participant }) => hasLiveTrack(participant, Track.Source.ScreenShare));
  const isVideoActive = cam || screen || allRemote.some((p) => hasLiveTrack(p, Track.Source.Camera) || hasLiveTrack(p, Track.Source.ScreenShare));
  const speakingIds = new Set(room.activeSpeakers.map((p) => p.identity));

  useEffect(() => {
    if (pinnedIdentity && !participants.some((p) => p.participant?.identity === pinnedIdentity)) setPinnedIdentity(null);
  }, [pinnedIdentity, participants]);

  const publishChat = useCallback((body, attachmentId) => {
    // Attachment-only messages arrive with the next state poll; only text is
    // echoed instantly (docs/superpowers/specs/2026-09-25-call-guest-chat-attachments-design.md).
    if (body) {
      const echo = { type: "chat", body, senderName: myName, senderKind: "guest", createdAt: new Date().toISOString() };
      try {
        room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(echo)), { reliable: true });
      } catch { /* not connected */ }
    }
    onSendMessage(body, attachmentId ? { attachmentId } : undefined);
  }, [room, myName, onSendMessage]);

  const publishSignal = useCallback((obj) => {
    try {
      room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(obj)), { reliable: true });
    } catch { /* not connected */ }
  }, [room]);

  const ephemeral = useCallEphemeral({
    room,
    publishData: publishSignal,
    selfIdentity: room.localParticipant?.identity,
    selfName: myName || "Invitado",
    isHost: false,
  });

  async function toggleMic() {
    try { const n = !mic; await room.localParticipant.setMicrophoneEnabled(n); setMic(n); } catch { /* noop */ }
  }
  async function toggleCam() {
    try { const n = !cam; await room.localParticipant.setCameraEnabled(n); setCam(n); refresh(); } catch { /* noop */ }
  }
  async function toggleScreen() {
    try { const n = !screen; await room.localParticipant.setScreenShareEnabled(n); setScreen(n); refresh(); } catch { /* noop */ }
  }

  const view = resolveCallView({
    participantCount: participants.length,
    hasScreenShare: screenEntries.length > 0,
    isVideoActive,
    layoutPref: "auto",
    pinnedIdentity,
    isPhone,
  });
  const focusedSpeaker = useFocusedSpeaker(speakingIds, room.localParticipant?.identity);
  const focusMain = participants.find((e) => e.participant?.identity === pinnedIdentity)
    ?? participants.find((e) => e.participant?.identity === focusedSpeaker)
    ?? participants.find((e) => !e.isLocal)
    ?? localEntry;
  const tileInfo = (identity) => {
    const p = participants.find((e) => e.participant?.identity === identity)?.participant;
    return p ? { name: p.name || (identity === room.localParticipant?.identity ? myName : "Participante") } : null;
  };
  const tileProps = (entry) => {
    const id = entry.participant?.identity;
    return {
      info: tileInfo(id),
      handRaised: entry.isLocal ? ephemeral.myHandRaised : ephemeral.raisedHands.has(id),
      speaking: speakingIds.has(id),
      pinned: pinnedIdentity === id,
      onPin: participants.length > 1 ? setPinned : null,
      mirrorLocalCamera: true,
    };
  };
  const stage = {
    entries: participants,
    screenEntries,
    activeScreenIdentity: activeScreen,
    onSelectScreen: setActiveScreen,
    focusMain,
    tileProps,
    tileInfo,
    speakingIds,
    isPhone,
    landscape,
    stripCollapsed,
    onToggleStrip: () => setStripCollapsed((v) => !v),
    onStopSharing: toggleScreen,
    mirrorLocalCamera: true,
    localEntry,
    raisedHands: ephemeral.raisedHands,
    myHandRaised: ephemeral.myHandRaised,
    directSwapped,
    onToggleDirectSwap: isPhone ? () => setDirectSwapped((v) => !v) : null,
    waitingText: participants.length === 1 ? "Esperando a que los demás se conecten…" : null,
  };

  const chatNode = (
    <GuestRoomChat
      polled={messages}
      liveIncoming={live}
      onSend={publishChat}
      myName={myName}
      onUploadFile={uploadFile}
      onResolveAttachmentUrl={getAttachmentUrl}
    />
  );
  const status = connected ? "connected" : "connecting";

  return (
    <div className="runly-call fixed inset-0 flex h-dvh flex-col overflow-hidden">
      {isPhone ? (
        <MobileCallTopBar
          title={title}
          status={status}
          elapsed={elapsed}
          recordingActive={recordingActive}
          recordingElapsed={elapsed}
          onMinimize={null}
          canSwitchCamera={false}
          canInvite={false}
          onOpenPeople={null}
        />
      ) : (
        <CallTopBar title={title} status={status} elapsed={elapsed} recordingActive={recordingActive} recordingElapsed={elapsed} />
      )}

      <div className="flex min-h-0 flex-1">
        <main className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", isPhone ? "px-2" : "px-3 pb-3")}>
          <div className="relative min-h-0 flex-1">
            <CallStage view={view} stage={stage} />
            <CallReactionsOverlay reactions={ephemeral.reactions} />
          </div>
          {!isPhone && (
            <div className="flex shrink-0 justify-center pt-3">
              <div role="toolbar" aria-label="Controles de la llamada" className="call-glass flex items-center gap-1 rounded-2xl p-1.5">
                <DockSplitButton
                  icon={mic ? Mic : MicOff}
                  label="Micrófono"
                  tone={mic ? "default" : "off"}
                  pressed={!mic}
                  onClick={toggleMic}
                  menuLabel="Elegir micrófono y altavoz"
                  menu={<MicDeviceMenu room={room} micEnabled={mic} mediaDevices={mediaDevices} />}
                />
                <DockSplitButton
                  icon={cam ? Camera : CameraOff}
                  label="Cámara"
                  tone={cam ? "default" : "off"}
                  pressed={!cam}
                  onClick={toggleCam}
                  menuLabel="Elegir cámara"
                  menu={<CameraDeviceMenu mediaDevices={mediaDevices} />}
                />
                <span className="mx-1 h-8 w-px bg-white/10" aria-hidden />
                <DockButton icon={screen ? ScreenShareOff : MonitorUp} label={screen ? "Dejar de compartir" : "Compartir"} tone={screen ? "accent" : "default"} onClick={toggleScreen} />
                <ReactionPopover onReact={ephemeral.sendReaction}>
                  <DockButton icon={SmilePlus} label="Reaccionar" />
                </ReactionPopover>
                <DockButton icon={Hand} label={ephemeral.myHandRaised ? "Bajar mano" : "Levantar mano"} tone={ephemeral.myHandRaised ? "hand" : "default"} onClick={ephemeral.toggleHand} />
                <span className="mx-1 h-8 w-px bg-white/10" aria-hidden />
                <DockButton icon={MessageSquare} label="Chat" tone={chatOpen ? "accent" : "default"} onClick={() => setChatOpen((v) => !v)} />
                <span className="mx-1 h-8 w-px bg-white/10" aria-hidden />
                <DockButton icon={PhoneOff} label="Salir" tone="danger" wide onClick={onLeave} />
              </div>
            </div>
          )}
        </main>
        {!isPhone && chatOpen && (
          <aside className="call-glass dark m-3 ml-0 flex w-95 shrink-0 flex-col overflow-hidden rounded-2xl" aria-label="Chat de la llamada">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="text-sm font-semibold">Mensajes</p>
              <button type="button" onClick={() => setChatOpen(false)} aria-label="Cerrar chat" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{chatNode}</div>
          </aside>
        )}
      </div>

      {isPhone && (
        <nav
          aria-label="Controles de la llamada"
          className="flex shrink-0 items-start justify-around gap-1 px-2 pt-2"
          style={{ paddingBottom: "calc(0.6rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <MobileCallButton icon={mic ? Mic : MicOff} label={mic ? "Silenciar" : "Activar"} tone={mic ? "default" : "off"} onClick={toggleMic} />
          <MobileCallButton icon={cam ? Camera : CameraOff} label="Cámara" tone={cam ? "default" : "off"} onClick={toggleCam} />
          <ReactionPopover onReact={ephemeral.sendReaction} onToggleHand={ephemeral.toggleHand} handRaised={ephemeral.myHandRaised}>
            <MobileCallButton icon={SmilePlus} label="Reaccionar" tone={ephemeral.myHandRaised ? "hand" : "default"} />
          </ReactionPopover>
          <MobileCallButton icon={MessageSquare} label="Chat" onClick={() => setChatOpen(true)} />
          <MobileCallButton icon={PhoneOff} label="Salir" tone="danger" onClick={onLeave} />
        </nav>
      )}

      {isPhone && (
        <Sheet open={chatOpen} onOpenChange={setChatOpen}>
          <SheetContent side="bottom" className="call-dialog h-[85dvh] max-h-[85dvh] gap-0 overflow-hidden p-0" style={{ zIndex: 10002 }}>
            <SheetTitle className="sr-only">Chat de la llamada</SheetTitle>
            <SheetDescription className="sr-only">Mensajes con los participantes</SheetDescription>
            <div className="min-h-0 flex-1 pt-2">{chatNode}</div>
          </SheetContent>
        </Sheet>
      )}

      {remote.map((p) => <RemoteAudio key={`a-${p.identity}`} participant={p} />)}
    </div>
  );
}
