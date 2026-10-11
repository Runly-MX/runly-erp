import { useCallback, useEffect, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import { toast } from "sonner";

const PREFS_KEY = "runly.calls.devices";
const KINDS = ["audioinput", "videoinput", "audiooutput"];

export function readDevicePrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}

function writeDevicePref(kind, deviceId) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readDevicePrefs(), [kind]: deviceId }));
  } catch { /* storage disabled — the choice just isn't remembered */ }
}

// Picking a speaker needs HTMLMediaElement.setSinkId (Chromium desktop and
// Android Chrome). Safari/iOS and most WebViews route output themselves.
export const OUTPUT_SELECTION_SUPPORTED =
  typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

// Room options that start the call on the user's remembered devices.
export function roomDeviceDefaults() {
  const prefs = readDevicePrefs();
  return {
    ...(prefs.audioinput ? { audioCaptureDefaults: { deviceId: prefs.audioinput } } : {}),
    ...(prefs.videoinput ? { videoCaptureDefaults: { deviceId: prefs.videoinput } } : {}),
    ...(prefs.audiooutput && OUTPUT_SELECTION_SUPPORTED ? { audioOutput: { deviceId: prefs.audiooutput } } : {}),
  };
}

function cleanLabel(device, index, kind) {
  if (device.label) return device.label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "");
  const noun = kind === "audioinput" ? "Micrófono" : kind === "videoinput" ? "Cámara" : "Altavoz";
  return `${noun} ${index + 1}`;
}

// Lists the local microphones, cameras and speakers, tracks which one the
// room is using, and switches between them. Labels are empty until the
// browser has granted media permission, so we re-list once tracks are live.
export function useMediaDevices(room, { enabled = true } = {}) {
  const [devices, setDevices] = useState({ audioinput: [], videoinput: [], audiooutput: [] });
  const [active, setActive] = useState(() => readDevicePrefs());

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const next = {};
    for (const kind of KINDS) {
      if (kind === "audiooutput" && !OUTPUT_SELECTION_SUPPORTED) { next[kind] = []; continue; }
      try {
        const list = await Room.getLocalDevices(kind, false);
        next[kind] = list
          .filter((d) => d.deviceId && d.deviceId !== "communications")
          .map((d, i) => ({ deviceId: d.deviceId, label: cleanLabel(d, i, kind) }));
      } catch {
        next[kind] = [];
      }
    }
    setDevices(next);
    setActive((current) => {
      const resolved = { ...current };
      for (const kind of KINDS) {
        const roomActive = room?.getActiveDevice?.(kind);
        if (roomActive) resolved[kind] = roomActive;
      }
      return resolved;
    });
  }, [room, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const onChange = () => refresh();
    room?.on?.(RoomEvent.MediaDevicesChanged, onChange);
    room?.on?.(RoomEvent.LocalTrackPublished, onChange);
    room?.on?.(RoomEvent.ActiveDeviceChanged, onChange);
    return () => {
      room?.off?.(RoomEvent.MediaDevicesChanged, onChange);
      room?.off?.(RoomEvent.LocalTrackPublished, onChange);
      room?.off?.(RoomEvent.ActiveDeviceChanged, onChange);
    };
  }, [room, enabled, refresh]);

  const select = useCallback(async (kind, deviceId) => {
    try {
      await room.switchActiveDevice(kind, deviceId, true);
      writeDevicePref(kind, deviceId);
      setActive((current) => ({ ...current, [kind]: deviceId }));
    } catch (error) {
      toast.error(error?.message || "No se pudo cambiar el dispositivo.");
    }
  }, [room]);

  return { devices, active, select, refresh, outputSupported: OUTPUT_SELECTION_SUPPORTED };
}
