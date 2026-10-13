import { useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { CallStage } from "../layout/CallStage";
import { resolveCallView } from "../lib/callViewMode";
import { formatClock } from "../ui/callTheme";
import { useFocusedSpeaker } from "../hooks/useFocusedSpeaker";
import { PortraitRecordingStage } from "./PortraitRecordingStage";
import "../ui/call-ui.css";

const LOGO = "/runly/runly-logo-horizontal-dark.png";

function RemoteAudio({ participant }) {
  const ref = useRef(null);
  const track = participant?.getTrackPublication?.(Track.Source.Microphone)?.track;
  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return undefined;
    track.attach(el);
    return () => track.detach(el);
  }, [track]);
  // react-doctor-disable-next-line media-has-caption -- recorder page, mixes room audio into the recording.
  return <audio ref={ref} autoPlay />;
}

const hasLiveTrack = (participant, source) => {
  const pub = participant?.getTrackPublication?.(source);
  return Boolean(pub?.track && !pub.isMuted);
};

function readMeta(room) {
  try { return JSON.parse(room?.metadata || "{}"); } catch { return {}; }
}

// LiveKit Egress composite page (LIVEKIT_EGRESS_TEMPLATE_URL): the egress
// container opens it with ?url=&token=, it joins as a hidden recorder and
// renders the same stage as the app with a Runly footer. "START_RECORDING" /
// "END_RECORDING" console lines are the egress template protocol.
export default function EgressCallScreen() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const room = useMemo(() => new Room({ adaptiveStream: false, dynacast: false }), []);
  const [, force] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(false);
  // The egress browser window has the output's size: a vertical recording
  // (see call-recording-service.js) opens it taller than wide.
  const portrait = window.innerHeight > window.innerWidth;

  useEffect(() => {
    document.documentElement.classList.add("dark");
    // Recordings are watched full-screen at 1080p: scale every rem-based size.
    document.documentElement.style.fontSize = window.innerHeight > window.innerWidth ? "18px" : "20px";
    const refresh = () => force((n) => n + 1);
    const events = [
      RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
      RoomEvent.ActiveSpeakersChanged, RoomEvent.RoomMetadataChanged,
    ];
    events.forEach((e) => room.on(e, refresh));
    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      console.log("START_RECORDING"); // eslint-disable-line no-console
    };
    room.on(RoomEvent.TrackSubscribed, start);
    room.on(RoomEvent.Disconnected, () => console.log("END_RECORDING")); // eslint-disable-line no-console
    const url = params.get("url");
    const token = params.get("token");
    if (url && token) {
      room.connect(url, token, { autoSubscribe: true })
        .then(() => {
          refresh();
          // Audio-only rooms may never subscribe a video track: start anyway.
          setTimeout(start, 1500);
        })
        .catch(() => console.log("END_RECORDING")); // eslint-disable-line no-console
    }
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => room.off(e, refresh));
      room.disconnect();
    };
  }, [room, params]);

  const remote = Array.from(room.remoteParticipants.values());
  const people = remote.filter((p) => !p.identity?.startsWith("screen:"));
  const entries = people.map((participant) => ({ participant, isLocal: false }));
  const screenEntries = remote
    .filter((p) => hasLiveTrack(p, Track.Source.ScreenShare))
    .map((participant) => ({ participant, isLocal: false }));
  const speakingIds = new Set(room.activeSpeakers.map((p) => p.identity));
  const focusedId = useFocusedSpeaker(speakingIds, null);
  const isVideoActive = remote.some((p) => hasLiveTrack(p, Track.Source.Camera) || hasLiveTrack(p, Track.Source.ScreenShare));
  const meta = readMeta(room);
  const view = entries.length
    ? resolveCallView({ participantCount: Math.max(entries.length, 3), hasScreenShare: screenEntries.length > 0, isVideoActive, layoutPref: "auto" })
    : "grid";
  const tileInfo = (identity) => {
    const p = people.find((x) => x.identity === identity);
    return p ? { name: p.name || "Participante", role: identity?.startsWith("guest_") ? "guest" : null } : null;
  };
  const tileProps = (entry) => ({
    info: tileInfo(entry.participant?.identity),
    speaking: speakingIds.has(entry.participant?.identity),
    onPin: null,
    mirrorLocalCamera: false,
    // Never crop a camera in the file: a phone held upright is recorded whole,
    // in its own vertical shape, not zoomed to fill a landscape tile. Doesn't
    // depend on the measured aspect (it can arrive late or wrong from iOS).
    fit: "contain",
  });
  const stage = {
    entries,
    screenEntries,
    activeScreenIdentity: null,
    onSelectScreen: () => {},
    focusMain: entries.find((e) => speakingIds.has(e.participant?.identity)) ?? entries[0],
    tileProps,
    tileInfo,
    speakingIds,
    isPhone: false,
    landscape: false,
    stripCollapsed: false,
    onToggleStrip: () => {},
    onStopSharing: () => {},
    mirrorLocalCamera: false,
    localEntry: entries[0],
    raisedHands: new Map(),
    myHandRaised: false,
    directSwapped: false,
    onToggleDirectSwap: null,
    waitingText: entries.length ? null : "Esperando a los participantes…",
  };
  const presenterId = screenEntries[0]?.participant?.identity?.replace(/^screen:/, "");
  const presenterName = tileInfo(presenterId)?.name ?? screenEntries[0]?.participant?.name ?? "Alguien";
  const date = new Date(meta.recordingStartedAt ?? Date.now()).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="runly-call fixed inset-0 flex flex-col overflow-hidden p-6">
      <div className="relative min-h-0 flex-1">
        {portrait ? (
          <PortraitRecordingStage
            entries={entries}
            screenEntries={screenEntries}
            mainEntry={entries.find((e) => e.participant?.identity === focusedId) ?? null}
            tileProps={tileProps}
            presenterName={presenterName}
          />
        ) : (
          <CallStage view={view === "direct" || view === "audio" ? "grid" : view} stage={stage} />
        )}
      </div>
      <footer className={portrait ? "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-white/80" : "flex shrink-0 items-center gap-4 pt-4 text-white/80"}>
        <img src={LOGO} alt="Runly" className="h-6 opacity-80" />
        <span className="h-5 w-px bg-white/15" aria-hidden />
        <span className="truncate text-base font-semibold text-white">{meta.title ?? "Reunión"}</span>
        {meta.companyName && <span className="truncate text-sm text-white/55">{meta.companyName}</span>}
        <span className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-white/55">{date}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 font-semibold text-red-300">
            <span className="call-rec-dot h-2 w-2 rounded-full bg-red-500" aria-hidden />
            <span className="font-mono tabular-nums">{formatClock(elapsed)}</span>
          </span>
        </span>
      </footer>
      {people.map((p) => <RemoteAudio key={`a-${p.identity}`} participant={p} />)}
    </div>
  );
}
