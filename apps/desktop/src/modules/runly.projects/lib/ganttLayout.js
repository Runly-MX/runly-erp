// Geometry of the Gantt chart (pure, unit tested). Task dates are noon-UTC instants; the
// chart works in whole days counted from the UTC epoch, so a day never shifts with the
// time zone. Spec docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 1.

export const ZOOMS = Object.freeze({ day: { label: "Día", dayWidth: 44 }, week: { label: "Semana", dayWidth: 20 }, month: { label: "Mes", dayWidth: 8 } });
export const ROW_HEIGHT = 40;
export const BAR_HEIGHT = 24;
const DAY_MS = 86_400_000;

// "2026-11-03" or an ISO string -> days since the epoch (null when empty or invalid).
export function dayNumber(value) {
  if (!value) return null;
  const time = Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(time) ? null : Math.round(time / DAY_MS);
}

// eslint-disable-next-line no-restricted-syntax -- a day number is a UTC calendar day by definition
export const dayText = (number) => new Date(number * DAY_MS).toISOString().slice(0, 10);

export const taskSpan = (task) => {
  const start = dayNumber(task.startDate);
  const due = dayNumber(task.dueDate);
  if (start === null && due === null) return null;
  const first = start ?? due;
  const last = due ?? start;
  return { start: Math.min(first, last), end: Math.max(first, last) };
};

// The visible range: every dated task and today with a margin, at least `minDays` long.
export function buildRange(tasks, today, minDays = 42) {
  const spans = tasks.map(taskSpan).filter(Boolean);
  const first = Math.min(today, ...spans.map((span) => span.start)) - 7;
  const last = Math.max(today, ...spans.map((span) => span.end)) + 14;
  return { origin: first, days: Math.max(minDays, last - first + 1) };
}

export const xOfDay = (day, origin, dayWidth) => (day - origin) * dayWidth;
export const dayOfX = (x, origin, dayWidth) => origin + Math.floor(x / dayWidth);

// Pixel box of a task's bar (both end days included).
export function barBox(span, origin, dayWidth, row) {
  return {
    x: xOfDay(span.start, origin, dayWidth),
    width: Math.max(dayWidth, (span.end - span.start + 1) * dayWidth),
    y: row * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2,
    height: BAR_HEIGHT,
  };
}

// New span after a drag of `delta` whole days. move shifts both ends; start/end change one
// end and never cross the other (a bar is at least one day).
export function dragSpan(span, mode, delta) {
  if (mode === "move") return { start: span.start + delta, end: span.end + delta };
  if (mode === "start") return { start: Math.min(span.start + delta, span.end), end: span.end };
  return { start: span.start, end: Math.max(span.end + delta, span.start) };
}

export const deltaDays = (pixels, dayWidth) => Math.round(pixels / dayWidth) || 0;

// Finish-to-start arrow: out of the blocker's right end, into the blocked bar's left end.
export function arrowPath(from, to) {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const gap = 10;
  if (x2 >= x1 + gap * 2) {
    const mid = x1 + gap;
    return { d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2 - 2}`, end: { x: x2, y: y2 } };
  }
  // The blocked bar starts before the blocker ends: go around so the arrow stays readable.
  const detour = (y1 + y2) / 2 + (y2 >= y1 ? ROW_HEIGHT / 2 : -ROW_HEIGHT / 2);
  return { d: `M ${x1} ${y1} H ${x1 + gap} V ${detour} H ${x2 - gap} V ${y2} H ${x2 - 2}`, end: { x: x2, y: y2 } };
}

// A blocked task that starts on or before the day its blocker ends.
export function breaksOrder(blockerSpan, blockedSpan) {
  return Boolean(blockerSpan && blockedSpan && blockedSpan.start <= blockerSpan.end);
}

// Ticks for the header: [{ x, label, major }] for the chosen zoom.
export function headerTicks(origin, days, dayWidth, zoom) {
  const ticks = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date((origin + index) * DAY_MS);
    const dayOfMonth = date.getUTCDate();
    const weekday = date.getUTCDay();
    if (zoom === "day") ticks.push({ x: index * dayWidth, label: String(dayOfMonth), sub: ["D", "L", "M", "M", "J", "V", "S"][weekday], weekend: weekday === 0 || weekday === 6, major: dayOfMonth === 1 });
    else if (zoom === "week" && weekday === 1) ticks.push({ x: index * dayWidth, label: String(dayOfMonth), major: dayOfMonth <= 7 });
    else if (zoom === "month" && dayOfMonth === 1) ticks.push({ x: index * dayWidth, label: "", major: true });
  }
  return ticks;
}

// Months across the range for the top header row: [{ x, width, label }].
export function monthBands(origin, days, dayWidth) {
  const bands = [];
  let start = 0;
  let current = null;
  for (let index = 0; index <= days; index += 1) {
    const date = index < days ? new Date((origin + index) * DAY_MS) : null;
    const key = date ? `${date.getUTCFullYear()}-${date.getUTCMonth()}` : null;
    if (key !== current) {
      if (current !== null) {
        const first = new Date((origin + start) * DAY_MS);
        const label = first.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
        bands.push({ x: start * dayWidth, width: (index - start) * dayWidth, label: label.charAt(0).toUpperCase() + label.slice(1) });
      }
      start = index;
      current = key;
    }
  }
  return bands;
}
