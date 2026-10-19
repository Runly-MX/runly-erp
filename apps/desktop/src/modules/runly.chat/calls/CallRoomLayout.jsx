import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn, ConfirmDialog, useCoarsePointer } from "@runly/ui";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useChatMessages } from "../hooks/useChatMessages";
import { useChatConversationDetail } from "../hooks/useChatConversationDetail";
import { getConversationDisplayName } from "../lib/chatUtils";
import { playCallSound } from "./callSounds";
import { CallChatPanel } from "./CallChatPanel";
import { CallShareDialog } from "./CallShareDialog";
import { LobbyBanner } from "./layout/LobbyBanner";
import { CallReactionsOverlay } from "./CallReactionsOverlay";
import { RaisedHandsBar } from "./RaisedHandsBar";
import { CallTopBar, MobileCallTopBar } from "./layout/CallTopBar";
import { CallStage } from "./layout/CallStage";
import { LastMessageChip } from "./layout/LastMessageChip";
import { CallControlDock } from "./controls/CallControlDock";
import { MobileCallBar } from "./controls/MobileCallControls";
import { DeviceSettingsDialog, ShortcutsDialog } from "./controls/CallDialogs";
import { CallSidePanel, CallPanelSheet } from "./panel/CallSidePanel";
import { CallPeoplePanel } from "./people/CallPeoplePanel";
import { useCallRoster } from "./hooks/useCallRoster";
import { useMediaDevices } from "./hooks/useMediaDevices";
import { useCallShortcuts } from "./hooks/useCallShortcuts";
import { useChromeVisibility } from "./hooks/useChromeVisibility";
import { useFocusedSpeaker } from "./hooks/useFocusedSpeaker";
import { useElementSize } from "./layout/useElementSize";
import { resolveCallView, resolveViewport, shouldAutoHideChrome } from "./lib/callViewMode";
import "./ui/call-ui.css";

const LAYOUT_PREF_KEY = "runly.calls.layout";
const PANEL_PREF_KEY = "atlas.calls.chatPanel.collapsed";
const RING_UI_MS = 36_000;

function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage disabled */ }
}
function unwrap(r) {
  return r?.data ?? r;
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return size;
}

function OutgoingCallTone({ active }) {
  useEffect(() => {
    if (!active) return undefined;
    return playCallSound("ringtone", { loop: true, volume: 0.5 });
  }, [active]);
  return null;
}

// Presentation shell of a call: resolves the view for the device and call
// type, and owns panels, roster, devices, dialogs, shortcuts and the
// immersive chrome. Connection and media logic stay in CallRoom.
export function CallRoomLayout({ room, call, media, people, live, actions, invitePanel = null, peoplePanelNonce = 0 }) {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const conversationId = call.session.call.conversationId;
  const { width, height } = useWindowSize();
  const coarse = useCoarsePointer();
  const viewport = resolveViewport({ width, height, coarse });
  const isPhone = viewport === "phone" || viewport === "phone-landscape";
  const landscape = viewport === "phone-landscape";
  const useSheets = viewport !== "desktop";

  // ---- conversation, link, chat -------------------------------------------
  const { data: detailData } = useChatConversationDetail(conversationId);
  const conversation = unwrap(detailData);
  const title = call.inPerson
    ? "Reunión presencial"
    : call.session.call.calendarEvent?.title
      || (conversation ? getConversationDisplayName(conversation, userProfile?.id) : null)
      || call.session.call.initiator?.displayName
      || "Reunión";
  const linkQuery = useQuery({
    queryKey: ["call-link", conversationId],
    queryFn: async () => unwrap(await runly.calls.getLink(conversationId, token))?.link ?? null,
    enabled: Boolean(conversationId && token),
    staleTime: 60_000,
    retry: false,
  });
  const link = linkQuery.data ?? null;

  const { data: chatData } = useChatMessages(conversationId);
  const messages = useMemo(() => chatData?.data ?? [], [chatData]);

  // ---- panels ---------------------------------------------------------------
  // Desktop: a remembered side column. Tablets/phones: a bottom sheet.
  const [panel, setPanel] = useState(() => (readPref(PANEL_PREF_KEY, "0") === "1" ? null : "chat"));
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (useSheets) setSheetOpen(false);
  }, [useSheets]);
  const openPanel = useCallback((tab) => {
    setPanel(tab);
    if (useSheets) setSheetOpen(true);
    else writePref(PANEL_PREF_KEY, "0");
  }, [useSheets]);
  const closePanel = useCallback(() => {
    if (useSheets) setSheetOpen(false);
    else { setPanel(null); writePref(PANEL_PREF_KEY, "1"); }
  }, [useSheets]);
  const togglePanel = useCallback((tab) => {
    const open = useSheets ? sheetOpen && panel === tab : panel === tab;
    if (open) closePanel();
    else openPanel(tab);
  }, [useSheets, sheetOpen, panel, openPanel, closePanel]);
  useEffect(() => { if (peoplePanelNonce) openPanel("people"); }, [peoplePanelNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownPanel = useSheets ? (sheetOpen ? panel : null) : panel;
  // Remembered so the closing panel keeps its content while it slides out.
  const lastPanelRef = useRef("chat");
  if (panel) lastPanelRef.current = panel;
  const chatVisible = shownPanel === "chat";

  // Unread chat messages while the chat is not on screen.
  const seenRef = useRef(null);
  const [chatUnread, setChatUnread] = useState(0);
  useEffect(() => {
    if (!chatData) return;
    if (seenRef.current === null || chatVisible) {
      seenRef.current = messages.length;
      setChatUnread(0);
      return;
    }
    if (messages.length > seenRef.current) {
      setChatUnread((n) => n + (messages.length - seenRef.current));
      seenRef.current = messages.length;
    }
  }, [messages.length, chatVisible, chatData]);

  const callStartedAt = new Date(call.session.call.startedAt ?? call.session.call.createdAt ?? Date.now()).getTime();
  const lastMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.message_type === "system" || m.sender_type === "system") continue;
      if (new Date(m.created_at).getTime() < callStartedAt) return null;
      return m;
    }
    return null;
  }, [messages, callStartedAt]);

  // ---- roster ---------------------------------------------------------------
  const roster = useCallRoster({
    participants: call.participants,
    members: conversation?.members ?? [],
    guests: people.guestsApi.guests,
    initiatorId: call.session.call.initiatedByUserId,
    raisedHands: live.raisedHands,
    speakingIds: live.speakingIds,
  });
  const tileInfo = useCallback((identity) => roster.infoByIdentity.get(identity) ?? null, [roster]);
  const inCallIds = useMemo(() => new Set(roster.inCall.map((p) => p.identity)), [roster]);
  const memberIds = useMemo(() => new Set((conversation?.members ?? []).map((m) => m.userId)), [conversation?.members]);

  const [ringing, setRinging] = useState(() => new Set());
  const ring = useCallback(async (profileId) => {
    const drop = () => setRinging((s) => { const n = new Set(s); n.delete(profileId); return n; });
    setRinging((s) => new Set(s).add(profileId));
    setTimeout(drop, RING_UI_MS);
    try {
      await runly.calls.ring(call.session.call.id, [profileId], token);
    } catch (error) {
      toast.error(error?.message || "No se pudo llamar.");
      drop();
    }
  }, [call.session.call.id, token]);

  const moderate = useMemo(() => ({
    mute: async (person) => {
      try {
        if (person.guestId) await people.guestsApi.mute(person.guestId, true);
        else {
          const res = unwrap(await runly.calls.muteParticipant(call.session.call.id, person.identity, token));
          if (res?.liveActionOk === false) { toast.error("No se pudo silenciar, inténtalo de nuevo."); return; }
        }
        toast.success(`Silenciaste a ${person.name}.`);
      } catch (error) { toast.error(error?.message || "No se pudo silenciar."); }
    },
    remove: async (person) => {
      try {
        if (person.guestId) await people.guestsApi.kick(person.guestId);
        else await runly.calls.removeParticipant(call.session.call.id, person.identity, token);
        toast.success(`${person.name} salió de la llamada.`);
      } catch (error) { toast.error(error?.message || "No se pudo quitar a la persona."); }
    },
  }), [call.session.call.id, token, people.guestsApi]);

  // Tile props shared by every layout.
  const myIdentity = room.localParticipant?.identity;
  const tileProps = useCallback((entry) => {
    const id = entry.participant?.identity;
    const info = tileInfo(id);
    const canModerate = people.isHost && !entry.isLocal && info?.role !== "host" && entry.source !== "screen";
    return {
      info,
      handRaised: entry.isLocal ? live.myHandRaised : live.raisedHands.has(id),
      speaking: live.speakingIds.has(id),
      pinned: live.pinnedIdentity === id,
      onPin: call.participants.length > 1 ? actions.setPinned : null,
      mirrorLocalCamera: media.mirrorLocalCamera,
      actions: canModerate && info
        ? { onMute: () => moderate.mute(info), onRemove: () => moderate.remove(info) }
        : null,
    };
  }, [tileInfo, people.isHost, live, call.participants.length, actions.setPinned, media.mirrorLocalCamera, moderate]);

  // ---- view -----------------------------------------------------------------
  const [layoutPref, setLayoutPrefState] = useState(() => readPref(LAYOUT_PREF_KEY, "auto"));
  const setLayoutPref = useCallback((value) => { setLayoutPrefState(value); writePref(LAYOUT_PREF_KEY, value); }, []);
  const view = resolveCallView({
    participantCount: call.participants.length,
    hasScreenShare: call.screenEntries.length > 0,
    isVideoActive: media.isVideoActive,
    layoutPref,
    pinnedIdentity: live.pinnedIdentity,
    inPerson: call.inPerson,
    isPhone,
  });
  const focusedSpeaker = useFocusedSpeaker(live.speakingIds, myIdentity);
  const focusMain = useMemo(() => {
    const byId = (id) => call.participants.find((e) => e.participant?.identity === id) ?? null;
    return byId(live.pinnedIdentity) ?? byId(focusedSpeaker) ?? call.participants.find((e) => !e.isLocal) ?? call.participants[0];
  }, [call.participants, live.pinnedIdentity, focusedSpeaker]);
  const [activeScreen, setActiveScreen] = useState(null);
  const [stripCollapsed, setStripCollapsed] = useState(false);

  const autoHide = shouldAutoHideChrome({ viewport, view, isVideoActive: media.isVideoActive });
  const chrome = useChromeVisibility({ autoHide, pinned: useSheets && sheetOpen });

  // ---- dialogs ----------------------------------------------------------------
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [confirmEndAll, setConfirmEndAll] = useState(false);
  const mediaDevices = useMediaDevices(room, { enabled: call.engineReady });

  // A recording started by someone else: tell everyone once (consent).
  const currentRecording = media.recording.current;
  const recordingId = currentRecording?.id ?? null;
  const announcedRef = useRef(null);
  useEffect(() => {
    if (!recordingId || announcedRef.current === recordingId) return;
    announcedRef.current = recordingId;
    if (currentRecording?.startedByUserId === userProfile?.id) return;
    const by = currentRecording?.startedBy?.displayName;
    toast.info(by ? `${by} empezó a grabar la reunión.` : "Esta reunión se está grabando.", { id: `rec-${recordingId}` });
  }, [recordingId]); // eslint-disable-line react-hooks/exhaustive-deps
  const recordingStartedAt = currentRecording?.startedAt ? new Date(currentRecording.startedAt).getTime() : null;
  // `call.elapsed` ticks every second, which keeps this fresh too.
  const recordingElapsed = recordingStartedAt ? Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000)) : 0;

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const isDirect = conversation?.type === "direct";
  const ctl = {
    ...media,
    myHandRaised: live.myHandRaised,
    recordingActive: media.recording.active,
    recordingBusy: media.recording.busy,
    toggleRecording: media.recording.active ? media.recording.stop : media.recording.start,
    trackTranscriptionActive: media.trackTranscription.active,
    trackTranscriptionBusy: media.trackTranscription.busy,
    toggleTranscription: media.trackTranscription.active ? media.trackTranscription.stop : media.trackTranscription.start,
    sendReaction: live.sendReaction,
    toggleHand: live.toggleHand,
    panel: shownPanel,
    togglePanel,
    chatUnread,
    peopleCount: roster.inCall.length,
    lobbyCount: people.isHost ? roster.lobby.length : 0,
    layoutPref,
    setLayoutPref,
    openDeviceSettings: () => setSettingsOpen(true),
    openShortcuts: () => setShortcutsOpen(true),
    toggleFullscreen,
    canEndForAll: people.isHost && !isDirect && call.participants.length + roster.lobby.length > 1,
    leave: () => actions.leave(),
    requestEndForAll: () => setConfirmEndAll(true),
    audioRoute: media.audioRoute ?? null,
  };

  useCallShortcuts({
    // While an in-person recording runs, the mic shortcut is the pause button.
    toggleMic: view === "inperson" && media.recording.active && media.togglePause ? media.togglePause : media.toggleMic,
    toggleCamera: media.toggleCamera,
    toggleHand: live.toggleHand,
    toggleChat: () => togglePanel("chat"),
    togglePeople: () => togglePanel("people"),
    openShortcuts: () => setShortcutsOpen(true),
  }, { enabled: !isPhone });

  // Stage width decides whether the dock keeps its labels.
  const [stageRef, stageSize] = useElementSize();
  const compactDock = stageSize.width > 0 && stageSize.width < 760;

  const status = call.outgoingToneActive ? "ringing" : call.connectionState;
  // In-person recorder: the top bar is the one recording status (REC / EN
  // PAUSA / not started), so the stage keeps its space for the preview.
  const inPersonView = view === "inperson";
  const recordingPaused = inPersonView && media.recording.active && Boolean(media.paused);
  const idleLabel = inPersonView
    ? (media.recording.busy ? "PREPARANDO…" : media.canRecord ? "LISTO PARA GRABAR" : "SIN GRABAR")
    : null;
  const waitingText = call.participants.length === 1
    ? (call.outgoingToneActive ? "Llamando…" : "Esperando a que alguien se una…")
    : null;

  // Swipe down on the phone top bar minimizes the call.
  const dragRef = useRef(null);
  const topBarDrag = isPhone ? {
    onPointerDown: (e) => { dragRef.current = { y: e.clientY }; },
    onPointerUp: (e) => {
      if (dragRef.current && e.clientY - dragRef.current.y > 60) actions.minimize?.();
      dragRef.current = null;
    },
    onPointerCancel: () => { dragRef.current = null; },
  } : null;

  const peopleNode = (
    <CallPeoplePanel
      roster={roster}
      isHost={people.isHost}
      myIdentity={myIdentity}
      raisedHands={live.raisedHands}
      speakingIds={live.speakingIds}
      pinnedIdentity={live.pinnedIdentity}
      onAdmit={people.guestsApi.admit}
      onDeny={people.guestsApi.deny}
      onAdmitAll={() => roster.lobby.forEach((g) => people.guestsApi.admit(g.id))}
      onRing={ring}
      ringingIds={ringing}
      onMute={moderate.mute}
      onRemove={moderate.remove}
      onPin={call.participants.length > 1 ? actions.setPinned : null}
      onInvite={people.canShare ? () => setShareOpen(true) : null}
      onCopyLink={link?.url ? () => navigator.clipboard?.writeText(link.url).then(() => toast.success("Enlace copiado.")) : null}
    />
  );
  const chatNode = <CallChatPanel conversationId={conversationId} onClose={closePanel} />;
  const panelCounts = {
    chat: chatUnread,
    people: people.isHost && roster.lobby.length ? roster.lobby.length : roster.inCall.length,
    lobby: people.isHost ? roster.lobby.length : 0,
  };

  const stage = {
    entries: call.participants,
    screenEntries: call.screenEntries,
    activeScreenIdentity: activeScreen,
    onSelectScreen: setActiveScreen,
    focusMain,
    tileProps,
    tileInfo,
    speakingIds: live.speakingIds,
    isPhone,
    landscape,
    stripCollapsed,
    onToggleStrip: () => setStripCollapsed((v) => !v),
    onStopSharing: media.toggleScreen,
    mirrorLocalCamera: media.mirrorLocalCamera,
    localEntry: call.localEntry,
    raisedHands: live.raisedHands,
    myHandRaised: live.myHandRaised,
    directSwapped: live.directSwapped,
    onToggleDirectSwap: isPhone ? actions.toggleDirectSwap : null,
    waitingText,
    inPersonProps: {
      localParticipant: call.localEntry?.participant,
      elapsed: recordingElapsed,
      engineReady: call.engineReady,
      micEnabled: media.micEnabled,
      recordingActive: media.recording.active,
      recordingBusy: media.recording.busy,
      canRecord: media.canRecord,
      onStartRecording: media.startInPersonRecording ?? media.recording.start,
      onToggleMic: media.toggleMic,
      paused: Boolean(media.paused),
      onTogglePause: media.togglePause,
      mediaDevices,
      audioRoute: media.audioRoute ?? null,
      onOpenDeviceSettings: () => setSettingsOpen(true),
      onOpenShortcuts: isPhone ? null : () => setShortcutsOpen(true),
      canSwitchCamera: media.canSwitchCamera,
      onSwitchCamera: media.switchCamera,
      cameraEnabled: media.cameraEnabled,
      onToggleCamera: media.toggleCamera,
      screenEnabled: media.screenEnabled,
      screenShareSupported: media.screenShareSupported,
      onToggleScreen: media.toggleScreen,
      mirror: media.mirrorLocalCamera,
      onFinish: () => actions.leave({ endForAll: people.isHost }),
      onInvite: people.canShare ? () => setShareOpen(true) : null,
    },
  };

  return (
    <div
      className="runly-call fixed inset-0 z-46 flex h-dvh max-h-dvh flex-col overflow-hidden"
      onPointerMove={autoHide && !coarse ? chrome.reveal : undefined}
    >
      <OutgoingCallTone active={call.outgoingToneActive} />

      {isPhone ? (
        <MobileCallTopBar
          title={title}
          status={status}
          elapsed={call.elapsed}
          recordingActive={media.recording.active}
          recordingPaused={recordingPaused}
          recordingElapsed={recordingElapsed}
          idleLabel={idleLabel}
          meetingId={link?.meetingId}
          onMinimize={actions.minimize}
          canSwitchCamera={media.canSwitchCamera && media.cameraEnabled}
          onSwitchCamera={media.switchCamera}
          canInvite={people.canShare}
          onInvite={() => setShareOpen(true)}
          onOpenPeople={() => openPanel("people")}
          lobbyCount={ctl.lobbyCount}
          hidden={!chrome.visible}
          dragHandlers={topBarDrag}
        />
      ) : (
        <CallTopBar
          title={title}
          subtitle={view === "presentation" ? "Presentación en curso" : null}
          status={status}
          elapsed={call.elapsed}
          recordingActive={media.recording.active}
          recordingPaused={recordingPaused}
          recordingElapsed={recordingElapsed}
          idleLabel={idleLabel}
          meetingId={link?.meetingId}
          quality={room.localParticipant?.connectionQuality}
          layoutPref={layoutPref}
          onLayoutChange={inPersonView ? null : setLayoutPref}
          canInvite={people.canShare}
          onInvite={() => setShareOpen(true)}
          lobbyCount={ctl.lobbyCount}
          onMinimize={actions.minimize}
          hidden={!chrome.visible}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <main
          ref={stageRef}
          className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", isPhone ? "px-2" : "px-3 pb-3")}
          onClick={autoHide ? chrome.toggle : undefined}
        >
          <div
            className="relative min-h-0 flex-1"
            style={landscape ? { paddingLeft: "var(--sal)", paddingRight: "var(--sar)" } : undefined}
          >
            <CallStage view={view} stage={stage} />
            {invitePanel && view !== "presentation" && view !== "inperson" && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center p-3 sm:items-center">
                <div className="call-fade-up pointer-events-auto w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                  {isValidElement(invitePanel) && people.canShare
                    ? cloneElement(invitePanel, { onOpenInvite: () => setShareOpen(true) })
                    : invitePanel}
                </div>
              </div>
            )}
            <CallReactionsOverlay reactions={live.reactions} />
            {people.isHost && <RaisedHandsBar raisedHands={live.raisedHands} onLower={live.lowerHand} />}
            {people.isHost && roster.lobby.length > 0 && shownPanel !== "people" && (
              <div className="pointer-events-none absolute inset-x-2 top-2 z-20">
                <LobbyBanner
                  lobby={roster.lobby}
                  onAdmit={people.guestsApi.admit}
                  onDeny={people.guestsApi.deny}
                  onAdmitAll={() => roster.lobby.forEach((g) => people.guestsApi.admit(g.id))}
                  onOpen={() => openPanel("people")}
                />
              </div>
            )}
          </div>

          {!isPhone && view !== "inperson" && (
            <div data-hidden={!chrome.visible} className="call-chrome call-chrome-bottom flex shrink-0 justify-center pt-3">
              <CallControlDock ctl={ctl} room={room} mediaDevices={mediaDevices} compact={compactDock} />
            </div>
          )}
        </main>

        {!useSheets && (
          <CallSidePanel open={Boolean(panel)} tab={panel ?? lastPanelRef.current} onTab={setPanel} onClose={closePanel} counts={panelCounts} chat={chatNode} people={peopleNode} />
        )}
      </div>

      {isPhone && view !== "inperson" && (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {!sheetOpen && chrome.visible && !landscape && (
            <LastMessageChip
              message={lastMessage}
              senderName={lastMessage?.sender?.displayName ?? "Alguien"}
              avatarUrl={lastMessage?.sender?.avatarUrl ?? null}
              unread={chatUnread}
              onOpen={() => openPanel("chat")}
            />
          )}
          <MobileCallBar ctl={ctl} hidden={!chrome.visible} />
        </div>
      )}

      {useSheets && (
        <CallPanelSheet
          open={sheetOpen}
          tab={panel ?? "chat"}
          onTab={setPanel}
          onClose={closePanel}
          counts={panelCounts}
          chat={chatNode}
          people={peopleNode}
        />
      )}

      {people.canShare && (
        <CallShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          conversationId={conversationId}
          callId={call.session.call.id}
          inCallIds={inCallIds}
          memberIds={memberIds}
          inCall
        />
      )}
      <DeviceSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        room={room}
        mediaDevices={mediaDevices}
        micEnabled={media.micEnabled}
        cameraEnabled={media.cameraEnabled}
        mirror={media.mirrorLocalCamera}
        audioRoute={media.audioRoute ?? null}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <ConfirmDialog
        open={confirmEndAll}
        onOpenChange={setConfirmEndAll}
        title="Finalizar para todos"
        description="La reunión terminará para todas las personas, incluidos los invitados."
        confirmLabel="Finalizar reunión"
        variant="destructive"
        onConfirm={() => { setConfirmEndAll(false); actions.leave({ endForAll: true }); }}
      />
    </div>
  );
}
