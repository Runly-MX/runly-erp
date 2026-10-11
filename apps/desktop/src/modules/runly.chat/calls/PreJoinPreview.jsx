import { useEffect, useRef, useState } from "react";
import { cn, SelectField } from "@runly/ui";
import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import { useAudioLevel } from "./hooks/useAudioLevel";
import { readDevicePrefs, writeDevicePref } from "./hooks/useMediaDevices";

function useLocalPreview({ mic, camera, audioId, videoId }) {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!mic && !camera) { setStream(null); return undefined; }
    let cancelled = false;
    let current = null;
    navigator.mediaDevices?.getUserMedia({
      audio: mic ? (audioId ? { deviceId: { exact: audioId } } : true) : false,
      video: camera ? (videoId ? { deviceId: { exact: videoId } } : { facingMode: "user" }) : false,
    })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        current = s;
        setStream(s);
        setError(null);
      })
      .catch((e) => { if (!cancelled) setError(e?.name === "NotAllowedError" ? "denied" : "unavailable"); });
    return () => {
      cancelled = true;
      current?.getTracks().forEach((t) => t.stop());
    };
  }, [mic, camera, audioId, videoId]);
  return { stream, error };
}

function useDeviceList(trigger) {
  const [list, setList] = useState({ audioinput: [], videoinput: [] });
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((all) => {
      const pick = (kind, noun) => all
        .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== "communications")
        .map((d, i) => ({ value: d.deviceId, label: d.label || `${noun} ${i + 1}` }));
      setList({ audioinput: pick("audioinput", "Micrófono"), videoinput: pick("videoinput", "Cámara") });
    }).catch(() => {});
  }, [trigger]);
  return list;
}

// Camera preview + mic meter + device pickers shown before entering a call.
// Reports { mic, camera } through onChange; device choices are remembered
// for the call (same storage as the in-call device menus).
export function PreJoinPreview({ initialMic = true, initialCamera = true, name = "", onChange, tone = "dark", showDevices = true }) {
  const [mic, setMic] = useState(initialMic);
  const [camera, setCamera] = useState(initialCamera);
  const prefs = readDevicePrefs();
  const [audioId, setAudioId] = useState(prefs.audioinput ?? null);
  const [videoId, setVideoId] = useState(prefs.videoinput ?? null);
  const { stream, error } = useLocalPreview({ mic, camera, audioId, videoId });
  const devices = useDeviceList(stream);
  const videoRef = useRef(null);
  const audioTrack = stream?.getAudioTracks?.()[0] ?? null;
  const { level } = useAudioLevel(audioTrack, { historySize: 1 });

  useEffect(() => { onChange?.({ mic, camera }); }, [mic, camera]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.srcObject = stream?.getVideoTracks?.().length ? stream : null;
  }, [stream]);

  const dark = tone === "dark";
  const hasVideo = camera && stream?.getVideoTracks?.().length;

  return (
    <div className="space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#0c172d] ring-1 ring-black/10">
        {hasVideo ? (
          // react-doctor-disable-next-line media-has-caption -- local camera preview, no audio.
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-white/60">
            <CameraOff className="h-6 w-6" aria-hidden />
            {error === "denied" ? "Permite el acceso a la cámara y el micrófono en tu navegador." : camera ? "Cámara no disponible" : "Cámara apagada"}
          </div>
        )}
        {name && (
          <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">{name}</span>
        )}
        <div className="absolute bottom-2 right-2 flex gap-2">
          <button
            type="button"
            onClick={() => setMic((v) => !v)}
            aria-pressed={!mic}
            aria-label={mic ? "Apagar micrófono" : "Encender micrófono"}
            className={cn("relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full text-white ring-1 ring-white/20 backdrop-blur", mic ? "bg-black/45" : "bg-red-500")}
          >
            {mic && <span className="absolute inset-x-0 bottom-0 bg-emerald-400/40 transition-[height] duration-75" style={{ height: `${Math.round(level * 100)}%` }} aria-hidden />}
            {mic ? <Mic className="relative h-5 w-5" /> : <MicOff className="relative h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => setCamera((v) => !v)}
            aria-pressed={!camera}
            aria-label={camera ? "Apagar cámara" : "Encender cámara"}
            className={cn("flex h-11 w-11 items-center justify-center rounded-full text-white ring-1 ring-white/20 backdrop-blur", camera ? "bg-black/45" : "bg-red-500")}
          >
            {camera ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {showDevices && (devices.audioinput.length > 1 || devices.videoinput.length > 1) && (
        <div className={cn("grid gap-3 sm:grid-cols-2", dark && "dark")}>
          {devices.audioinput.length > 1 && (
            <SelectField
              label="Micrófono"
              value={audioId ?? devices.audioinput[0]?.value}
              onValueChange={(id) => { setAudioId(id); writeDevicePref("audioinput", id); }}
              options={devices.audioinput}
            />
          )}
          {devices.videoinput.length > 1 && (
            <SelectField
              label="Cámara"
              value={videoId ?? devices.videoinput[0]?.value}
              onValueChange={(id) => { setVideoId(id); writeDevicePref("videoinput", id); }}
              options={devices.videoinput}
            />
          )}
        </div>
      )}
    </div>
  );
}
