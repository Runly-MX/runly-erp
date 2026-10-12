import { BestFitGrid } from "./BestFitGrid";
import { FocusView, PresentationView, AudioView } from "./StageViews";
import { DirectFocusLayout } from "../DirectFocusLayout";
import { InPersonRecorder } from "../InPersonRecorder";
import { LANDSCAPE, PORTRAIT, cameraAspect, isPortraitAspect, useVideoAspectVersion } from "../lib/videoAspect";

// Renders the stage for the resolved view (see lib/callViewMode.js).
export function CallStage({ view, stage }) {
  useVideoAspectVersion();
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
  // Everyone on an upright phone camera: lay the grid out for portrait tiles.
  const cameraRatios = entries.map((e) => cameraAspect(e.participant)).filter(Boolean);
  const allPortrait = !screenEntries.length && cameraRatios.length > 0 && cameraRatios.every(isPortraitAspect);
  const aspect = isPhone && !landscape ? 3 / 4 : allPortrait ? PORTRAIT : LANDSCAPE;
  return <BestFitGrid entries={gridEntries} tileProps={tileProps} aspect={aspect} fill={isPhone} />;
}
