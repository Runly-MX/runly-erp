// Domain events of the chat for automations (spec
// docs/superpowers/specs/2026-10-31-automations-calls-chat-autoreply-design.md §B): a
// visitor wrote in an external chat, a person wrote to another one directly. Messages
// are frequent, so an event is only written when an automation of the company (or a
// module) listens to it. Best effort: never affects sending the message.
import { publishDomainEvent } from "../../services/domain-events/events.js";
import { localDate, zoneOffsetMs } from "../../services/automation-schedule-math.js";

const CACHE_MS = 60_000;
const listeners = new Map();
let zone = { value: "America/Mexico_City", at: 0 };

async function instanceZone(prisma) {
  if (Date.now() - zone.at < CACHE_MS) return zone.value;
  const row = await prisma.instanceConfig?.findUnique?.({ where: { key: "instance_time_zone" }, select: { value: true } }).catch(() => null);
  zone = { value: row?.value || "America/Mexico_City", at: Date.now() };
  return zone.value;
}

// Hour (0-23) and weekday (0 = Sunday) of `at` in the instance's time zone.
export async function localClock(prisma, at = new Date()) {
  const timeZone = await instanceZone(prisma);
  const instant = new Date(at).getTime();
  const shifted = new Date(instant + zoneOffsetMs(instant, timeZone));
  const day = localDate(instant, timeZone);
  return { localHour: shifted.getUTCHours(), localWeekday: new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() };
}

export async function isListened(prisma, companyId, event) {
  const key = `${companyId}|${event}`;
  const cached = listeners.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const [automations, modules] = await Promise.all([
    prisma.systemAutomation.count({ where: { companyId, enabled: true, definition: { path: ["trigger", "event"], equals: event } } }).catch(() => 0),
    prisma.runlyModule.findMany({ where: { status: "INSTALLED", enabled: true }, select: { manifest: true } }).catch(() => []),
  ]);
  const value = automations > 0 || modules.some((mod) => Array.isArray(mod.manifest?.events?.subscribes) && mod.manifest.events.subscribes.includes(event));
  listeners.set(key, { value, at: Date.now() });
  if (listeners.size > 5000) listeners.clear();
  return value;
}

export async function publishChatEvent(prisma, { companyId, event, payload, at = new Date() }) {
  try {
    if (!companyId || !(await isListened(prisma, companyId, event))) return null;
    return await publishDomainEvent(prisma, { companyId, event, payload: { ...payload, ...(await localClock(prisma, at)) } });
  } catch (error) {
    console.warn("[runly.chat] no se pudo publicar", event, error?.message ?? error);
    return null;
  }
}
