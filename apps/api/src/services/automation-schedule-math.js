// Next occurrence of a Builder schedule trigger ({ every, at, weekday, day })
// in a time zone. Pure; used by the worker (automation-worker-service.js).
// Spec docs/superpowers/specs/2026-10-24-automation-studio-v2-stage-b-time-design.md.

const formatters = new Map();
function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    }));
  }
  return formatters.get(timeZone);
}

// Offset (ms) of the zone from UTC at an instant: local wall time minus UTC.
export function zoneOffsetMs(instant, timeZone) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(instant)).map((part) => [part.type, Number(part.value)]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

// UTC instant for a wall-clock time in the zone (two passes settle DST jumps).
export function zonedToUtc({ year, month, day, hour, minute }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - zoneOffsetMs(guess, timeZone);
  return first - (zoneOffsetMs(first, timeZone) - zoneOffsetMs(guess, timeZone));
}

function localDate(instant, timeZone) {
  const shifted = new Date(instant + zoneOffsetMs(instant, timeZone));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

const addDays = ({ year, month, day }, amount) => {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};
const weekdayOf = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day)).getUTCDay();

export function nextOccurrence(schedule, after, timeZone = "America/Mexico_City") {
  const from = after instanceof Date ? after.getTime() : Number(after);
  if (schedule.every === "hour") {
    const hour = 3_600_000;
    return new Date(Math.floor(from / hour) * hour + hour);
  }
  const [hour, minute] = String(schedule.at ?? "00:00").split(":").map(Number);
  const start = localDate(from, timeZone);
  for (let offset = 0; offset <= 62; offset += 1) {
    const date = addDays(start, offset);
    if (schedule.every === "week" && weekdayOf(date) !== schedule.weekday) continue;
    if (schedule.every === "month" && date.day !== schedule.day) continue;
    const instant = zonedToUtc({ ...date, hour, minute }, timeZone);
    if (instant > from) return new Date(instant);
  }
  throw new Error("No se pudo calcular la siguiente ejecución del horario.");
}
