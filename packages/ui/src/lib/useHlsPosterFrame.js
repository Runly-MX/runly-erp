import { useEffect, useState } from "react";

// Session cache: key -> data URL (or null when no frame could be taken), so a
// list re-render or re-visit doesn't download segments again.
const frames = new Map();
// Only a couple of extractions at a time: each one fetches a video segment.
const MAX_CONCURRENT = 2;
let running = 0;
const queue = [];

function schedule(task) {
  return new Promise((resolve) => {
    const run = async () => {
      running += 1;
      try { resolve(await task()); } finally {
        running -= 1;
        queue.shift()?.();
      }
    };
    if (running < MAX_CONCURRENT) run();
    else queue.push(run);
  });
}

// Grabs one frame (~a third in, at most 3s) from an HLS manifest. `manifest`
// is the .m3u8 TEXT (segments already signed), like call recordings carry.
async function extractFrame(manifest, width) {
  const { default: Hls } = await import("hls.js");
  const url = URL.createObjectURL(new Blob([manifest], { type: "application/vnd.apple.mpegurl" }));
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  let hls = null;
  try {
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 20_000);
      const done = (value) => { clearTimeout(timer); resolve(value); };
      video.addEventListener("loadedmetadata", () => {
        const d = Number.isFinite(video.duration) ? video.duration : 6;
        video.currentTime = Math.min(3, Math.max(0.5, d / 3));
      }, { once: true });
      video.addEventListener("seeked", () => {
        try {
          const ratio = video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 9 / 16;
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = Math.round(width * ratio);
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          done(canvas.toDataURL("image/jpeg", 0.75));
        } catch { done(null); }
      }, { once: true });
      video.addEventListener("error", () => done(null), { once: true });
      if (Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 4, autoStartLoad: true });
        hls.on(Hls.Events.ERROR, (_e, data) => { if (data?.fatal) done(null); });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
      } else {
        done(null);
      }
    });
  } finally {
    hls?.destroy();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

// Poster frame for an HLS video (a data URL), taken once `enabled` turns true
// (pass "is visible" so off-screen rows don't download anything). Returns
// { frame, loading }; frame stays null if the video can't be read.
export function useHlsPosterFrame(key, manifest, { enabled = true, width = 480 } = {}) {
  const [frame, setFrame] = useState(() => frames.get(key) ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key || !manifest || !enabled) return undefined;
    if (frames.has(key)) { setFrame(frames.get(key)); return undefined; }
    let cancelled = false;
    setLoading(true);
    schedule(() => extractFrame(manifest, width).catch(() => null)).then((value) => {
      frames.set(key, value);
      if (!cancelled) { setFrame(value); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [key, manifest, enabled, width]);

  return { frame, loading };
}
