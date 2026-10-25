// Notification digests: one email (daily or weekly, at the hour the person chooses) with
// what they have not seen and was not emailed already, plus a count of their pending
// tasks. Spec docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 3.
//
// Idempotency: the state of each person (`notifications.digest.state`) is claimed BEFORE
// sending, so a repeated pass of the worker never sends the same window twice (at most
// once; a crash between claim and send skips that window rather than duplicating it).
import { createCompanyMailer } from "./smtp-service.js";
import { renderRunlyEmailLayout } from "./email-templates.js";
import { isInDnd } from "./dnd.js";

export const PREF_KEY = "notifications.digest";
export const STATE_KEY = "notifications.digest.state";
export const GRACE_MS = 60 * 60 * 1000;
const MAX_PER_GROUP = 8;
const MAX_FETCH = 200;
const DAY_MS = 86_400_000;

const MODULE_LABELS = {
  chat: "Chat", projects: "Proyectos", calendar: "Calendario", purchases: "Compras", inventory: "Inventario",
  ledger: "Libro de cuentas", pfm: "Finanzas personales", notes: "Notas", hr: "Recursos humanos", lms: "Cursos",
  fleet: "Flota", automations: "Automatizaciones", growth: "Ventas", attendance: "Asistencia", module: "Módulos",
};

export function normalizeDigestPref(value) {
  const mode = ["daily", "weekly"].includes(value?.mode) ? value.mode : "off";
  const hour = Number.isInteger(value?.hour) && value.hour >= 0 && value.hour <= 23 ? value.hour : 8;
  const weekday = Number.isInteger(value?.weekday) && value.weekday >= 0 && value.weekday <= 6 ? value.weekday : 1;
  let timezone = typeof value?.timezone === "string" ? value.timezone : "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { timezone = "UTC"; }
  return { mode, hour, weekday, timezone };
}

function localParts(ms, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short",
  }).formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour, weekday };
}

const offsetMs = (ms, timezone) => {
  const p = localParts(ms, timezone);
  const second = new Date(ms).getUTCSeconds();
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, new Date(ms).getUTCMinutes(), second) - ms;
};

// The wall clock time `hour`:00 of a local calendar day, as a UTC instant.
function zonedToUtc(year, month, day, hour, timezone) {
  const guess = Date.UTC(year, month - 1, day, hour);
  let result = guess - offsetMs(guess, timezone);
  const again = guess - offsetMs(result, timezone);
  if (again !== result) result = again;
  return result;
}

// The most recent scheduled send time at or before `now` (a UTC instant in ms), or null when off.
export function windowStart(now, value) {
  const pref = normalizeDigestPref(value);
  if (pref.mode === "off") return null;
  const nowMs = new Date(now).getTime();
  const here = localParts(nowMs, pref.timezone);
  // Today's slot, or yesterday's when the hour has not come yet.
  let dayShift = here.hour >= pref.hour ? 0 : -1;
  if (pref.mode === "weekly") {
    const todayWeekday = (here.weekday + dayShift + 7) % 7;
    dayShift -= (todayWeekday - pref.weekday + 7) % 7;
  }
  const base = Date.UTC(here.year, here.month - 1, here.day) + dayShift * DAY_MS;
  const day = new Date(base);
  return zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), pref.hour, pref.timezone);
}

const groupKey = (eventType) => {
  const prefix = String(eventType ?? "").split(".")[0];
  return MODULE_LABELS[prefix] ? prefix : "other";
};

// notifications: [{ id, eventType, title, body, link, createdAt }] -> groups by module, newest first.
export function groupDigestItems(notifications) {
  const groups = new Map();
  for (const item of notifications) {
    const key = groupKey(item.eventType);
    if (!groups.has(key)) groups.set(key, { key, label: MODULE_LABELS[key] ?? "Otros", total: 0, items: [] });
    const group = groups.get(key);
    group.total += 1;
    if (group.items.length < MAX_PER_GROUP) group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export function renderDigest({ groups, total, pendingTasks, appBaseUrl, mode, brand = null }) {
  const period = mode === "weekly" ? "de la semana" : "del día";
  const subject = total ? `Resumen ${period}: ${total} ${total === 1 ? "aviso sin ver" : "avisos sin ver"}` : `Resumen ${period}`;
  const base = (appBaseUrl ?? "").replace(/\/$/, "");
  const link = (path) => (path ? (/^https?:/i.test(path) ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`) : `${base}/app/notifications`);
  const sections = groups.map((group) => {
    const rows = group.items.map((item) => `<li style="margin:0 0 6px"><a href="${escape(link(item.link))}" style="color:inherit;text-decoration:none"><strong>${escape(item.title)}</strong>${item.body ? `<br><span style="color:#71717a">${escape(String(item.body).slice(0, 140))}</span>` : ""}</a></li>`).join("");
    const more = group.total > group.items.length ? `<li style="color:#71717a">y ${group.total - group.items.length} más</li>` : "";
    return `<h3 style="margin:16px 0 6px;font-size:14px">${escape(group.label)} (${group.total})</h3><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.45">${rows}${more}</ul>`;
  }).join("");
  const tasks = pendingTasks > 0 ? `<p style="margin:0 0 8px;font-size:14px">Tienes <strong>${pendingTasks}</strong> ${pendingTasks === 1 ? "tarea pendiente para hoy o vencida" : "tareas pendientes para hoy o vencidas"}.</p>` : "";
  const html = renderRunlyEmailLayout({
    kicker: "Resumen", heading: total ? "Esto es lo que no has visto" : "Tu resumen", brand,
    bodyHtml: `${tasks}${sections}`, cta: { label: "Abrir Mi trabajo", url: `${base}/app/work` },
    footnote: "Recibes este resumen porque lo activaste en tus preferencias de avisos. Puedes cambiarlo o apagarlo en Notificaciones.",
  });
  const text = [
    subject, "",
    pendingTasks > 0 ? `Tareas pendientes para hoy o vencidas: ${pendingTasks}` : "",
    ...groups.flatMap((group) => ["", `${group.label} (${group.total})`, ...group.items.map((item) => `- ${item.title}`), ...(group.total > group.items.length ? [`  y ${group.total - group.items.length} más`] : [])]),
    "", `Abrir Mi trabajo: ${base}/app/work`,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
  return { subject, html, text };
}

export function createNotificationDigestService({ prisma, mailer = null, appBaseUrl = null, now = () => new Date() }) {
  const smtp = mailer ?? createCompanyMailer({ prisma });

  async function readJson(userId, key) {
    const row = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key } }, select: { value: true } });
    return row?.value ?? null;
  }
  const writeJson = (userId, key, value) => prisma.userPreference.upsert({ where: { userId_key: { userId, key } }, update: { value }, create: { userId, key, value } });

  async function getPreference(userId) {
    return normalizeDigestPref(await readJson(userId, PREF_KEY));
  }

  async function setPreference(userId, input) {
    const pref = normalizeDigestPref(input);
    await writeJson(userId, PREF_KEY, pref);
    return pref;
  }

  async function buildFor(userId, { from, to }) {
    const items = await prisma.notification.findMany({
      where: {
        userId, readAt: null, createdAt: { gt: new Date(from), lte: new Date(to) },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(to) } }],
        // Anything already emailed immediately is not repeated.
        deliveries: { none: { channel: "email", status: "sent" } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_FETCH,
      select: { id: true, companyId: true, eventType: true, title: true, body: true, link: true, createdAt: true },
    });
    const today = new Date(Date.UTC(new Date(to).getUTCFullYear(), new Date(to).getUTCMonth(), new Date(to).getUTCDate(), 12));
    const pendingTasks = await prisma.task.count({ where: { assigneeId: userId, dueDate: { lte: today }, status: { isDone: false }, project: { status: { not: "ARCHIVED" } } } }).catch(() => 0);
    return { items, pendingTasks };
  }

  // One pass: sends the digest to everyone whose window has come and has not been served.
  async function runDue() {
    const at = now();
    const rows = await prisma.userPreference.findMany({ where: { key: PREF_KEY }, select: { userId: true, value: true, user: { select: { email: true, enabled: true } } } });
    let sent = 0;
    let skipped = 0;
    for (const row of rows) {
      const pref = normalizeDigestPref(row.value);
      const start = windowStart(at, pref);
      if (start === null || !row.user?.enabled || !row.user?.email) continue;
      // Do Not Disturb: leave the window unclaimed so it is sent on the first pass after it ends.
      if (isInDnd(await readJson(row.userId, "notifications.dnd"), at)) continue;
      const state = await readJson(row.userId, STATE_KEY);
      if (state?.windowStart && new Date(state.windowStart).getTime() >= start) continue;
      // Claim the window first: a second pass (or a second worker) sees it as served.
      const previous = state?.lastSentAt ? new Date(state.lastSentAt).getTime() : start - (pref.mode === "weekly" ? 7 : 1) * DAY_MS;
      await writeJson(row.userId, STATE_KEY, { windowStart: new Date(start).toISOString(), lastSentAt: at.toISOString() });
      const { items, pendingTasks } = await buildFor(row.userId, { from: Math.max(previous, start - 7 * DAY_MS), to: at.getTime() - GRACE_MS });
      if (!items.length) { skipped += 1; continue; }
      const mail = renderDigest({ groups: groupDigestItems(items), total: items.length, pendingTasks, appBaseUrl, mode: pref.mode });
      try {
        await smtp.sendEmail({ companyId: items[0].companyId ?? null, to: row.user.email, subject: mail.subject, html: mail.html, text: mail.text });
        sent += 1;
      } catch (error) {
        console.error("[digest] no se pudo enviar el resumen:", error?.message ?? error);
      }
    }
    return { sent, skipped, checked: rows.length };
  }

  return { getPreference, setPreference, runDue };
}
