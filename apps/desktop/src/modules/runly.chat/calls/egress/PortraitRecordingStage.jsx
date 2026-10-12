import { Track } from "livekit-client";
import { MonitorUp } from "lucide-react";
import { ParticipantTile, TrackRenderer } from "../ParticipantTile";
import { cameraAspect, tileWidthFor, useVideoAspectVersion } from "../lib/videoAspect";

const STRIP_HEIGHT = 300;

// Stage for a vertical (phone-style) recording canvas, chosen when the
// recording started between upright phone cameras.
//  - one or two people: the speaker fills the frame, the other one sits in a
//    corner in their own upright shape, like a WhatsApp video call;
//  - a screen share starting mid-recording: the screen on top, the cameras
//    below (the canvas can't turn landscape inside the same file).
export function PortraitRecordingStage({ entries, screenEntries, mainEntry, tileProps, presenterName }) {
  useVideoAspectVersion();
  const screen = screenEntries[0] ?? null;

  if (screen) {
    return (
      <div className="flex h-full w-full flex-col gap-4">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-black ring-1 ring-white/[0.07]">
          <TrackRenderer participant={screen.participant} source={Track.Source.ScreenShare} fit="contain" />
          <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium backdrop-blur">
            <MonitorUp className="h-4 w-4" aria-hidden /> {presenterName} está presentando
          </span>
        </div>
        {entries.length > 0 && (
          <div className="flex shrink-0 justify-center gap-3" style={{ height: STRIP_HEIGHT }}>
            {entries.slice(0, 3).map((entry) => (
              <div
                key={entry.participant.identity}
                className="h-full"
                style={{ width: tileWidthFor(cameraAspect(entry.participant), STRIP_HEIGHT, 340) }}
              >
                <ParticipantTile participant={entry.participant} isLocal={false} preferSource="camera" avatarSize="lg" {...tileProps(entry)} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const main = mainEntry ?? entries[0];
  const corner = entries.find((e) => e !== main) ?? null;
  return (
    <div className="relative h-full w-full">
      {main && (
        <ParticipantTile
          participant={main.participant}
          isLocal={false}
          preferSource="camera"
          fit="auto"
          avatarSize="xl"
          className="rounded-3xl"
          {...tileProps(main)}
        />
      )}
      {corner && (
        <div
          className="absolute bottom-5 right-5 w-[34%] overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/25"
          style={{ aspectRatio: String(Math.max(cameraAspect(corner.participant) ?? 9 / 16, 9 / 16)) }}
        >
          <ParticipantTile participant={corner.participant} isLocal={false} preferSource="camera" avatarSize="md" compact {...tileProps(corner)} />
        </div>
      )}
    </div>
  );
}
