import { useEffect, useRef } from "react";
import { ConnectionState, Track } from "livekit-client";

// Coming back to the browser after the phone took over (a cellular call, the
// camera app, a long background stretch) can leave the call "frozen": the OS
// ended our mic/camera capture and paused the <video>/<audio> elements. When
// the page is visible again, restart whatever capture the user had on and
// resume playback. A dropped connection is handled by useCallAutoRejoin.
export function useResumeMediaOnReturn({ room, micEnabled, cameraEnabled }) {
  const wantedRef = useRef({ mic: micEnabled, camera: cameraEnabled });
  wantedRef.current = { mic: micEnabled, camera: cameraEnabled };

  useEffect(() => {
    let running = false;
    async function resume() {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        if (room.state === ConnectionState.Connected) {
          const wanted = wantedRef.current;
          for (const [source, on] of [[Track.Source.Microphone, wanted.mic], [Track.Source.Camera, wanted.camera]]) {
            const track = room.localParticipant.getTrackPublication(source)?.track;
            if (on && track?.mediaStreamTrack?.readyState === "ended") {
              await track.restartTrack().catch(() => {});
            }
          }
          await room.startAudio().catch(() => {});
        }
        document.querySelectorAll(".runly-call video, audio").forEach((el) => {
          if (el.srcObject && el.paused) el.play().catch(() => {});
        });
      } finally {
        running = false;
      }
    }
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [room]);
}
