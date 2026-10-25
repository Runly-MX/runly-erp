// Do Not Disturb and custom status rules (pure, no database). Spec
// docs/superpowers/specs/2026-10-26-status-and-dnd-design.md.
export const MAX_STATUS_TEXT = 80;
export const MAX_DND_DAYS = 30;
// Event types that still reach the person while Do Not Disturb is on (besides priority "critical").
export const DND_URGENT_EVENTS = new Set(["security.alert", "auth.security"]);

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const validZone = (zone) => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } };
const minutes = (text) => { const [h, m] = text.split(":").map(Number); return h * 60 + m; };

export function normalizeDnd(input, now = new Date()) {
  const raw = input && typeof input === "object" ? input : {};
  let until = null;
  if (raw.until) {
    const date = new Date(raw.until);
    const max = now.getTime() + MAX_DND_DAYS * 86_400_000;
    if (!Number.isNaN(date.getTime()) && date.getTime() > now.getTime()) until = new Date(Math.min(date.getTime(), max)).toISOString();
  }
  const quiet = raw.quiet && typeof raw.quiet === "object" ? raw.quiet : {};
  const days = [...new Set((Array.isArray(quiet.days) ? quiet.days : [0, 1, 2, 3, 4, 5, 6]).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return {
    until,
    quiet: {
      enabled: quiet.enabled === true,
      from: HHMM.test(quiet.from ?? "") ? quiet.from : "22:00",
      to: HHMM.test(quiet.to ?? "") ? quiet.to : "07:00",
      days,
      timezone: typeof quiet.timezone === "string" && validZone(quiet.timezone) ? quiet.timezone : "UTC",
    },
  };
}

function localClock(date, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", hour: "numeric", minute: "numeric", weekday: "short" }).formatToParts(date).map((p) => [p.type, p.value]));
  return { minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday) };
}

// true while the person should not be disturbed: an explicit "until" or inside quiet hours.
// Overnight ranges (22:00-07:00) belong to the weekday they start on.
export function isInDnd(pref, now = new Date()) {
  const dnd = normalizeDnd(pref, new Date(now.getTime() - 1));
  if (dnd.until && new Date(dnd.until).getTime() > now.getTime()) return true;
  const { quiet } = dnd;
  if (!quiet.enabled || !quiet.days.length) return false;
  const clock = localClock(now, quiet.timezone);
  const from = minutes(quiet.from);
  const to = minutes(quiet.to);
  if (from === to) return false;
  if (from < to) return quiet.days.includes(clock.weekday) && clock.minutes >= from && clock.minutes < to;
  if (clock.minutes >= from) return quiet.days.includes(clock.weekday);
  return clock.minutes < to && quiet.days.includes((clock.weekday + 6) % 7);
}

// A notification passes through DND when it is critical or on the urgent list.
export const passesDnd = ({ priority, eventType }) => priority === "critical" || DND_URGENT_EVENTS.has(eventType);

export function normalizeStatus(input, now = new Date()) {
  const raw = input && typeof input === "object" ? input : {};
  const text = String(raw.text ?? "").replace(/\u0000/g, "").trim().slice(0, MAX_STATUS_TEXT);
  const emoji = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(String(raw.emoji ?? "").trim())].slice(0, 1).map((s) => s.segment).join("");
  if (!text && !emoji) return null;
  let expiresAt = null;
  if (raw.expiresAt) {
    const date = new Date(raw.expiresAt);
    if (!Number.isNaN(date.getTime()) && date.getTime() > now.getTime()) expiresAt = date.toISOString();
    else return null;
  }
  return { emoji, text, expiresAt };
}

// A saved status that has expired is no status.
export const activeStatus = (saved, now = new Date()) => (saved && (!saved.expiresAt || new Date(saved.expiresAt).getTime() > now.getTime()) ? saved : null);
