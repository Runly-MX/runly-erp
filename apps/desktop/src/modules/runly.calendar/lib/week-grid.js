// Pure helpers for the phone week grid (unit tested). Dates are local "YYYY-MM-DD"
// strings like the rest of the calendar; weeks start on Sunday, as in the toolbar.
const DAY_MS = 86_400_000;

const noon = (dateStr) => new Date(`${dateStr}T12:00:00`);
const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function addDays(dateStr, days) {
  const d = noon(dateStr);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);

export function weekStartOf(dateStr) {
  return addDays(dateStr, -noon(dateStr).getDay());
}

export const weekDates = (startStr) => Array.from({ length: 7 }, (_, i) => addDays(startStr, i));

// Sunday-first 6x7 grid of date strings for a month (month 0-11).
export function monthCells(year, month) {
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return weekDates(weekStartOf(first)).concat(...[1, 2, 3, 4, 5].map((w) => weekDates(addDays(weekStartOf(first), w * 7))));
}

// The new instants of an event moved by `days` whole days (all-day events stay at UTC
// midnight; timed ones keep their local clock time).
export function shiftedEvent(event, days) {
  const shift = (value) => {
    if (!value) return value ?? null;
    const d = new Date(value);
    if (event.allDay) return new Date(d.getTime() + days * DAY_MS).toISOString();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };
  return { startAt: shift(event.startAt), endAt: shift(event.endAt) };
}

// Week summary for the widget: events, busy hours (timed only) and the busiest day.
export function weekSummary(eventsByDay) {
  let total = 0;
  let minutes = 0;
  let busiest = null;
  const seen = new Set();
  for (const [dateStr, { allDay, timed }] of eventsByDay) {
    const count = allDay.length + timed.length;
    if (!busiest || count > busiest.count) busiest = { dateStr, count };
    for (const ev of [...allDay, ...timed]) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      total += 1;
      if (!ev.allDay && ev.endAt) minutes += Math.max(0, (new Date(ev.endAt) - new Date(ev.startAt)) / 60_000);
    }
  }
  return { total, hours: Math.round(minutes / 6) / 10, busiest: busiest?.count ? busiest : null };
}
