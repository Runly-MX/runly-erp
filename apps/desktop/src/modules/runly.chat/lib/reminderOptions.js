// Quick reminder choices for a message. Pure; `now` is injectable for tests.
export function reminderOptions(now = new Date()) {
  const at = (date, hour = 9) => { const d = new Date(date); d.setHours(hour, 0, 0, 0); return d; };
  const plus = (ms) => new Date(now.getTime() + ms);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextMonday = new Date(now); nextMonday.setDate(nextMonday.getDate() + (((8 - nextMonday.getDay()) % 7) || 7));
  const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 7);
  const options = [
    { key: "20m", label: "En 20 minutos", at: plus(20 * 60_000) },
    { key: "1h", label: "En 1 hora", at: plus(3_600_000) },
    { key: "3h", label: "En 3 horas", at: plus(3 * 3_600_000) },
    { key: "tomorrow", label: "Mañana a las 9:00", at: at(tomorrow) },
  ];
  // "Lunes" would repeat "Mañana" when tomorrow is Monday.
  if (nextMonday.toDateString() !== tomorrow.toDateString()) options.push({ key: "monday", label: "El lunes a las 9:00", at: at(nextMonday) });
  options.push({ key: "week", label: "En una semana", at: at(nextWeek) });
  return options.map((option) => ({ ...option, iso: option.at.toISOString() }));
}

export function remindText(iso, now = new Date()) {
  if (!iso) return "";
  const date = new Date(iso);
  const time = date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `hoy ${time}`;
  return `${date.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}
