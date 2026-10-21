import { useCallback } from "react";
import { nonSpeakerRouteId } from "../lib/audioRoutes";

const SPEAKER_LABEL = /altavoz|speaker/i;
const EARPIECE_LABEL = /auricular|earpiece|receiver|tel[eé]fono|phone/i;

// One speaker on/off switch for the call chrome. In the Android app it drives
// the native audio route; in the browser/PWA it flips between the speaker and
// earpiece outputs when the browser exposes both (setSinkId + labelled
// outputs), and is hidden when it can't be honoured.
export function useSpeakerControl({ audioRoute, mediaDevices }) {
  const outputs = mediaDevices?.devices?.audiooutput ?? [];
  const webSpeaker = outputs.find((d) => SPEAKER_LABEL.test(d.label) && !EARPIECE_LABEL.test(d.label));
  const webEarpiece = outputs.find((d) => EARPIECE_LABEL.test(d.label));
  const webAvailable = Boolean(mediaDevices?.outputSupported && webSpeaker && webEarpiece);

  const nativeAvailable = Boolean(audioRoute?.supported && audioRoute.routes.some((r) => r.id === "speaker"));
  const speakerOn = nativeAvailable
    ? audioRoute.active === "speaker"
    : webAvailable && mediaDevices.active?.audiooutput === webSpeaker.deviceId;

  const toggle = useCallback(() => {
    if (nativeAvailable) {
      audioRoute.select(speakerOn ? nonSpeakerRouteId(audioRoute.routes) ?? "earpiece" : "speaker");
    } else if (webAvailable) {
      mediaDevices.select("audiooutput", speakerOn ? webEarpiece.deviceId : webSpeaker.deviceId);
    }
  }, [nativeAvailable, webAvailable, speakerOn, audioRoute, mediaDevices, webSpeaker, webEarpiece]);

  return { available: nativeAvailable || webAvailable, speakerOn, toggle };
}
