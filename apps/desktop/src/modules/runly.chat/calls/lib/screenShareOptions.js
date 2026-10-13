import { ScreenSharePresets } from "livekit-client";

// Shared screens are mostly text (code, documents): ask the encoder to keep
// resolution over frame rate and give it more bitrate than the 2.5 Mbps
// default, so the recording and remote viewers can read it.
export const SCREEN_CAPTURE_OPTIONS = { resolution: ScreenSharePresets.h1080fps15.resolution, contentHint: "text" };
export const SCREEN_PUBLISH_OPTIONS = {
  screenShareEncoding: { maxBitrate: 4_000_000, maxFramerate: 15 },
  degradationPreference: "maintain-resolution",
};
