function localKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// All-day events are stored as UTC midnight, with an inclusive endAt.
function utcKey(d) {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// Events that fall on a local calendar day (YYYY-MM-DD): all-day ones whose
// span covers it (multi-day project tasks included) and timed ones starting on it.
export function eventsOnDay(events, dateStr) {
  const allDay = [];
  const timed = [];
  for (const ev of events ?? []) {
    if (ev.allDay) {
      const sk = utcKey(ev.startAt);
      const ek = ev.endAt ? utcKey(ev.endAt) : sk;
      if (sk <= dateStr && dateStr <= ek) allDay.push(ev);
    } else if (localKey(new Date(ev.startAt)) === dateStr) {
      timed.push(ev);
    }
  }
  timed.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  return { allDay, timed };
}
