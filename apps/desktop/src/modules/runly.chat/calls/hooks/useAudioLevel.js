import { useEffect, useRef, useState } from "react";

// Live input level (0..1) of a MediaStreamTrack, sampled ~20 times a second
// from an AnalyserNode. Returns 0 while there is no track. Also returns a
// short rolling history for waveform-style meters.
export function useAudioLevel(mediaStreamTrack, { historySize = 48 } = {}) {
  const [level, setLevel] = useState(0);
  const [history, setHistory] = useState(() => new Array(historySize).fill(0));
  const historyRef = useRef(history);

  useEffect(() => {
    if (!mediaStreamTrack || mediaStreamTrack.readyState === "ended") {
      setLevel(0);
      return undefined;
    }
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) return undefined;
    let ctx;
    let source;
    let timer;
    try {
      ctx = new AudioCtx();
      source = ctx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        // RMS scaled so normal speech lands around 0.4-0.8.
        const next = Math.min(1, Math.sqrt(sum / data.length) * 4);
        setLevel(next);
        historyRef.current = [...historyRef.current.slice(1), next];
        setHistory(historyRef.current);
      }, 50);
    } catch {
      return undefined;
    }
    return () => {
      clearInterval(timer);
      try { source?.disconnect(); } catch { /* already gone */ }
      ctx?.close?.().catch(() => {});
    };
  }, [mediaStreamTrack]);

  return { level, history };
}
