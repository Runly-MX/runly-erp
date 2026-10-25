// Pure rules of task time tracking (no database). Spec
// docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 2.
export const MAX_ENTRY_MINUTES = 1440;
export const TIMER_LIMIT_MINUTES = 12 * 60;
const MINUTE_MS = 60_000;

// Minutes a timer ran, rounded to the nearest minute (at least 1). A timer running more
// than 12 hours is closed at 12 and flagged `capped` so the person reviews it.
export function timerMinutes(startedAt, now) {
  const elapsed = Math.max(1, Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / MINUTE_MS));
  return elapsed > TIMER_LIMIT_MINUTES ? { minutes: TIMER_LIMIT_MINUTES, capped: true } : { minutes: elapsed, capped: false };
}

// A manual entry: 1 to 1440 whole minutes, starting at most one day ahead of now.
export function checkManualEntry({ minutes, startedAt }, now = new Date()) {
  const value = Number(minutes);
  if (!Number.isInteger(value) || value < 1 || value > MAX_ENTRY_MINUTES) return { error: "El tiempo debe ser de 1 minuto a 24 horas." };
  const start = startedAt ? new Date(startedAt) : new Date(now);
  if (Number.isNaN(start.getTime())) return { error: "La fecha del registro no es válida." };
  if (start.getTime() > new Date(now).getTime() + 86_400_000) return { error: "No se puede registrar tiempo en el futuro." };
  return { minutes: value, startedAt: start };
}

// Monday (UTC) of the week of `date`, as YYYY-MM-DD.
export function weekStart(date) {
  const d = new Date(date);
  const back = (d.getUTCDay() + 6) % 7;
  // eslint-disable-next-line no-restricted-syntax -- weeks are bucketed on UTC calendar days
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

// entries: [{ taskId, userId, startedAt, minutes }] (finished ones only).
// Returns totals per task, per person and per week.
export function summarize(entries) {
  const byTask = {};
  const byUser = {};
  const byWeek = {};
  let total = 0;
  for (const entry of entries) {
    if (!Number.isInteger(entry.minutes)) continue;
    total += entry.minutes;
    byTask[entry.taskId] = (byTask[entry.taskId] ?? 0) + entry.minutes;
    byUser[entry.userId] = (byUser[entry.userId] ?? 0) + entry.minutes;
    const week = weekStart(entry.startedAt);
    byWeek[week] = (byWeek[week] ?? 0) + entry.minutes;
  }
  return { total, byTask, byUser, byWeek };
}

// "1 h 30 min" for the interface text of the API (kept here so MirAI answers match).
export function minutesText(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : "", rest || !hours ? `${rest} min` : ""].filter(Boolean).join(" ");
}
