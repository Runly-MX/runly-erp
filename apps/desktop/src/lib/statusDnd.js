// Pure helpers of the status / Do Not Disturb interface. Spec
// docs/superpowers/specs/2026-10-26-status-and-dnd-design.md.

// Durations offered for a status and for Do Not Disturb. `at(now)` returns the ISO expiry (null = no expiry).
export const STATUS_DURATIONS = [
  { value: "none", label: "No borrar", at: () => null },
  { value: "30m", label: "30 minutos", at: (now) => new Date(now.getTime() + 30 * 60_000).toISOString() },
  { value: "1h", label: "1 hora", at: (now) => new Date(now.getTime() + 3_600_000).toISOString() },
  { value: "today", label: "Hoy", at: (now) => endOfDay(now) },
  { value: "week", label: "Esta semana", at: (now) => endOfWeek(now) },
];
export const DND_DURATIONS = STATUS_DURATIONS.filter((item) => item.value !== "none").map((item) => (item.value === "today" ? { ...item, value: "tomorrow", label: "Hasta mañana", at: (now) => tomorrowMorning(now) } : item));

export const STATUS_PRESETS = [
  { emoji: "📅", text: "En reunión", duration: "1h" },
  { emoji: "🍽️", text: "Comiendo", duration: "1h" },
  { emoji: "🏠", text: "Trabajando desde casa", duration: "today" },
  { emoji: "🤒", text: "Enfermo", duration: "today" },
  { emoji: "🌴", text: "De vacaciones", duration: "week" },
];
export const STATUS_EMOJIS = ["😀", "📅", "🍽️", "☕", "🏠", "🚗", "🤒", "🌴", "🎧", "🔥", "💻", "🙏"];

// Local end of the day / week (Sunday) and 08:00 of the next day, as ISO instants.
export function endOfDay(now) { const d = new Date(now); d.setHours(23, 59, 0, 0); return d.toISOString(); }
export function endOfWeek(now) { const d = new Date(now); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); d.setHours(23, 59, 0, 0); return d.toISOString(); }
export function tomorrowMorning(now) { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString(); }

export const durationFor = (value, list = STATUS_DURATIONS, now = new Date()) => list.find((item) => item.value === value)?.at(now) ?? null;

export function untilText(iso, now = new Date()) {
  if (!iso) return "";
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `hasta las ${time}` : `hasta el ${date.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} ${time}`;
}
