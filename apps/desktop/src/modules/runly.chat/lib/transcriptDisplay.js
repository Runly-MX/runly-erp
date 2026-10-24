// Shared display helpers for transcript views (viewer dialog + synced panel).

export function formatTimestamp(ms) {
  const totalSeconds = Math.floor((ms ?? 0) / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Hues spread around the wheel so adjacent speakers stay distinguishable.
const SPEAKER_HUES = [217, 142, 32, 280, 350, 187, 48, 12];

// Mixing with the foreground keeps the tint readable in light and dark themes.
export function speakerColor(index) {
  const hue = SPEAKER_HUES[index % SPEAKER_HUES.length];
  return `color-mix(in srgb, hsl(${hue} 75% 55%) 80%, hsl(var(--foreground)))`;
}

// Segments of a PER_TRACK transcript are on the capture timeline (starts when
// the transcript row was created); the recording video starts at its own
// startedAt. A MIXED transcript is derived from the recording audio itself.
// Anything implausibly far apart is treated as unrelated clocks (offset 0).
const MAX_PLAUSIBLE_OFFSET_MS = 10 * 60 * 1000;
export function transcriptToVideoOffsetMs(transcript, recording) {
  if (transcript?.sourceKind !== "PER_TRACK") return 0;
  const created = new Date(transcript.createdAt).getTime();
  const started = new Date(recording?.startedAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(started)) return 0;
  const offset = created - started;
  return Math.abs(offset) <= MAX_PLAUSIBLE_OFFSET_MS ? offset : 0;
}

// Index of the last segment starting at or before `ms` (-1 when none).
export function activeSegmentIndex(segments, ms) {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].startMs <= ms) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

export const LANGUAGE_NAMES = { es: "Español", en: "Inglés", pt: "Portugués", fr: "Francés", de: "Alemán", it: "Italiano" };
export const LANGUAGE_OPTIONS = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "pt", label: "Portugués" },
  { value: "fr", label: "Francés" },
  { value: "de", label: "Alemán" },
  { value: "it", label: "Italiano" },
  { value: "auto", label: "Detectar automáticamente" },
];

const LANGUAGE_KEY = "runly.chat.transcriptLanguage";
export function readTranscriptLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return LANGUAGE_OPTIONS.some((o) => o.value === stored) ? stored : "es";
  } catch { return "es"; }
}
export function writeTranscriptLanguage(value) {
  try { localStorage.setItem(LANGUAGE_KEY, value); } catch { /* not remembered */ }
}
