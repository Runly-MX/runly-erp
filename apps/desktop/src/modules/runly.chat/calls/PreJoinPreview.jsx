import { useEffect, useRef, useState } from "react";
import { cn, SelectField } from "@runly/ui";
import { Camera, CameraOff, Mic, MicOff, Volume2 } from "lucide-react";
import { useAudioLevel } from "./hooks/useAudioLevel";
import { readDevicePrefs, writeDevicePref } from "./hooks/useMediaDevices";
import { CALL_SOUND_URLS } from "./callSounds";

const OUTPUT_SUPPORTED = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

function testSpeaker(deviceId) {
  try {
    const audio = new Audio(CALL_SOUND_URLS.join);
    audio.volume = 0.8;
    const play = () => audio.play().catch(() => {});
    if (deviceId && typeof audio.setSinkId === "function") audio.setSinkId(deviceId).then(play, play);
    else play();
  } catch { /* no audio output */ }
}

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
  const [list, setList] = useState({ audioinput: [], videoinput: [], audiooutput: [] });
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((all) => {
      const pick = (kind, noun) => all
        .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== "communications")
        .map((d, i) => ({ value: d.deviceId, label: d.label || `${noun} ${i + 1}` }));
      setList({
        audioinput: pick("audioinput", "Micrófono"),
        videoinput: pick("videoinput", "Cámara"),
        audiooutput: pick("audiooutput", "Altavoz"),
      });
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
  const [outputId, setOutputId] = useState(prefs.audiooutput ?? null);
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
      {showDevices && (
        <div className={cn("space-y-3 rounded-2xl p-3 ring-1", dark ? "bg-white/5 ring-white/10" : "bg-gray-50 ring-black/5")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {devices.audioinput.length > 0 && (
              <SelectField
                label="Micrófono"
                value={audioId ?? devices.audioinput[0]?.value}
                onValueChange={(id) => { setAudioId(id); writeDevicePref("audioinput", id); }}
                options={devices.audioinput}
              />
            )}
            {devices.videoinput.length > 0 && (
              <SelectField
                label="Cámara"
                value={videoId ?? devices.videoinput[0]?.value}
                onValueChange={(id) => { setVideoId(id); writeDevicePref("videoinput", id); }}
                options={devices.videoinput}
              />
            )}
            {OUTPUT_SUPPORTED && devices.audiooutput.length > 0 && (
              <SelectField
                label="Altavoz"
                value={outputId ?? devices.audiooutput[0]?.value}
                onValueChange={(id) => { setOutputId(id); writeDevicePref("audiooutput", id); }}
                options={devices.audiooutput}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-40 flex-1 items-center gap-2" aria-label="Nivel del micrófono">
              <Mic className={cn("h-4 w-4 shrink-0", dark ? "text-white/50" : "text-gray-400")} aria-hidden />
              <div className={cn("h-2 flex-1 overflow-hidden rounded-full", dark ? "bg-white/10" : "bg-gray-200")}>
                <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${mic ? Math.round(level * 100) : 0}%` }} />
              </div>
              <span className={cn("shrink-0 text-xs", dark ? "text-white/50" : "text-gray-500")}>{mic ? "Habla para probar" : "Silenciado"}</span>
            </div>
            <button
              type="button"
              onClick={() => testSpeaker(outputId)}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors",
                dark ? "bg-white/10 text-white hover:bg-white/15" : "bg-white text-gray-800 ring-1 ring-black/10 hover:bg-gray-100",
              )}
            >
              <Volume2 className="h-4 w-4" aria-hidden /> Probar altavoz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
