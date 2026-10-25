// Reading and showing durations for task time ("1h 30", "1:30", "90", "1.5h", "45m").

// Text -> whole minutes, or null when it is not a duration. A bare number is minutes.
export function parseDuration(text) {
  const value = String(text ?? "").trim().toLowerCase().replace(/,/g, ".");
  if (!value) return null;
  let match = /^(\d+):([0-5]?\d)$/.exec(value);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  match = /^(\d+(?:\.\d+)?)\s*h(?:oras?|rs?)?(?:\s*(\d+)\s*(?:m|min|minutos?)?)?$/.exec(value);
  if (match) return Math.round(Number(match[1]) * 60 + (match[2] ? Number(match[2]) : 0));
  match = /^(\d+)\s*(?:m|min|minutos?)?$/.exec(value);
  if (match) return Number(match[1]);
  return null;
}

// Minutes -> "1 h 30 min" ("" for null).
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : "", rest || !hours ? `${rest} min` : ""].filter(Boolean).join(" ");
}

// Seconds -> "01:05:09" for the running timer.
export function clock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(safe / 3600))}:${pad(Math.floor((safe % 3600) / 60))}:${pad(safe % 60)}`;
}
