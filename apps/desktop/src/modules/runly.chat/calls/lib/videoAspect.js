import { useSyncExternalStore } from "react";
import { Track } from "livekit-client";

// Real width/height ratio of each rendered video, keyed by
// "<identity>:<source>". TrackRenderer reports what the decoded frames
// measure (a phone held upright sends portrait frames); layouts read it to
// shape tiles, PiPs and the recording canvas. Falls back to the track's
// published dimensions until a frame has been decoded.

export const LANDSCAPE = 16 / 9;
export const PORTRAIT = 9 / 16;

const aspects = new Map();
const listeners = new Set();
let version = 0;

export function reportVideoAspect(identity, source, ratio) {
  if (!identity || !Number.isFinite(ratio) || ratio <= 0) return;
  const key = `${identity}:${source}`;
  const prev = aspects.get(key);
  if (prev && Math.abs(prev - ratio) < 0.01) return;
  aspects.set(key, ratio);
  version += 1;
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Re-render when any measured aspect changes (cheap: a counter).
export function useVideoAspectVersion() {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

export function videoAspectOf(participant, source = Track.Source.Camera) {
  if (!participant) return null;
  const measured = aspects.get(`${participant.identity}:${source}`);
  if (measured) return measured;
  const dims = participant.getTrackPublication?.(source)?.dimensions;
  return dims?.width && dims?.height ? dims.width / dims.height : null;
}

export function hasLiveVideo(participant, source = Track.Source.Camera) {
  const pub = participant?.getTrackPublication?.(source);
  return Boolean(pub?.track && !pub.isMuted);
}

// Camera aspect for layout, or null when the camera is off / unknown.
export function cameraAspect(participant) {
  return hasLiveVideo(participant) ? videoAspectOf(participant) : null;
}

export const isPortraitAspect = (ratio) => Boolean(ratio) && ratio < 0.95;

// Tile width for a fixed tile height: a portrait camera keeps its own shape
// (same height as a landscape tile, narrower) instead of being cropped into a
// landscape box. Never wider than `maxWidth`.
export function tileWidthFor(ratio, height, maxWidth) {
  if (!isPortraitAspect(ratio)) return maxWidth;
  return Math.min(maxWidth, Math.max(Math.round(height * Math.max(ratio, PORTRAIT)), 48));
}

// Recording canvas orientation, decided when the recording starts (the
// composite's size is fixed for the whole file). Vertical only for a phone-
// style call: at most two people, nobody sharing a screen, and every live
// camera upright. Anything with a computer camera, a screen share or a group
// records horizontally.
export function recordingOrientation({ people = [], hasScreenShare = false }) {
  if (hasScreenShare || people.length === 0 || people.length > 2) return "landscape";
  const ratios = people.map(cameraAspect).filter(Boolean);
  if (!ratios.length) return "landscape";
  return ratios.every(isPortraitAspect) ? "portrait" : "landscape";
}
