import { BestFitGrid } from "./BestFitGrid";
import { FocusView, PresentationView, AudioView } from "./StageViews";
import { DirectFocusLayout } from "../DirectFocusLayout";
import { InPersonRecorder } from "../InPersonRecorder";

// Renders the stage for the resolved view (see lib/callViewMode.js).
export function CallStage({ view, stage }) {
  const {
    entries, screenEntries, activeScreenIdentity, onSelectScreen, focusMain, tileProps, tileInfo,
    speakingIds, isPhone, landscape, stripCollapsed, onToggleStrip, onStopSharing, mirrorLocalCamera,
    localEntry, raisedHands, myHandRaised, directSwapped, onToggleDirectSwap, waitingText, inPersonProps,
  } = stage;

  if (view === "inperson") return <InPersonRecorder {...inPersonProps} />;

  if (view === "presentation") {
    return (
      <PresentationView
        screenEntries={screenEntries}
        activeScreenIdentity={activeScreenIdentity}
        onSelectScreen={onSelectScreen}
        cameraEntries={entries}
        tileProps={tileProps}
        presenterInfo={tileInfo}
        isPhone={isPhone}
        landscape={landscape}
        stripCollapsed={stripCollapsed}
        onToggleStrip={onToggleStrip}
        onStopSharing={onStopSharing}
        mirrorLocalCamera={mirrorLocalCamera}
      />
    );
  }

  if (view === "audio") {
    return <AudioView entries={entries} tileInfo={tileInfo} speakingIds={speakingIds} waitingText={waitingText} />;
  }

  if (view === "direct") {
    const remote = entries.find((e) => !e.isLocal) ?? null;
    if (!remote) return <AudioView entries={entries} tileInfo={tileInfo} speakingIds={speakingIds} waitingText={waitingText} />;
    return (
      <div className="h-full w-full">
        <DirectFocusLayout
          localEntry={localEntry}
          remoteEntry={remote}
          raisedHands={raisedHands}
          myHandRaised={myHandRaised}
          mirrorLocalCamera={mirrorLocalCamera}
          swapped={directSwapped}
          onToggleSwap={onToggleDirectSwap}
          speakingIds={speakingIds}
          tileProps={tileProps}
        />
      </div>
    );
  }

  if (view === "focus") {
    const main = focusMain ?? entries[0];
    const others = entries.filter((e) => e !== main);
    return (
      <FocusView
        mainEntry={main}
        others={others}
        tileProps={tileProps}
        isPhone={isPhone}
        landscape={landscape}
        stripCollapsed={stripCollapsed}
        onToggleStrip={onToggleStrip}
      />
    );
  }

  // Grid: a screen share (when the user forced the grid) is one more tile.
  const gridEntries = [
    ...screenEntries.map((e) => ({ ...e, source: "screen" })),
    ...entries,
  ];
  return <BestFitGrid entries={gridEntries} tileProps={tileProps} aspect={isPhone && !landscape ? 3 / 4 : 16 / 9} fill={isPhone} />;
}
