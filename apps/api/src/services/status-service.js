// Custom status and Do Not Disturb of each person, stored in UserPreference (no migration).
// Spec docs/superpowers/specs/2026-10-26-status-and-dnd-design.md.
import { activeStatus, isInDnd, normalizeDnd, normalizeStatus } from "./dnd.js";

export const STATUS_KEY = "chat.status";
export const DND_KEY = "notifications.dnd";
export const MAX_LOOKUP = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createStatusService({ prisma, now = () => new Date() }) {
  const read = async (userId, key) => (await prisma.userPreference.findUnique({ where: { userId_key: { userId, key } }, select: { value: true } }))?.value ?? null;
  const write = (userId, key, value) => prisma.userPreference.upsert({ where: { userId_key: { userId, key } }, update: { value }, create: { userId, key, value } });

  async function getStatus(userId) {
    return activeStatus(await read(userId, STATUS_KEY), now());
  }

  // null / empty clears it.
  async function setStatus(userId, input) {
    const status = normalizeStatus(input, now());
    if (!status) { await prisma.userPreference.deleteMany({ where: { userId, key: STATUS_KEY } }); return null; }
    await write(userId, STATUS_KEY, status);
    return status;
  }

  async function getDnd(userId) {
    const dnd = normalizeDnd(await read(userId, DND_KEY), now());
    return { ...dnd, active: isInDnd(dnd, now()) };
  }

  async function setDnd(userId, input) {
    const dnd = normalizeDnd(input, now());
    await write(userId, DND_KEY, dnd);
    return { ...dnd, active: isInDnd(dnd, now()) };
  }

  // Status and "does not want to be disturbed right now" of people in the caller's company.
  // The schedule itself is never returned, only whether DND is on.
  async function lookup(companyId, userIds) {
    const ids = [...new Set((userIds ?? []).filter((id) => UUID.test(String(id))))].slice(0, MAX_LOOKUP);
    if (!ids.length) return {};
    const members = await prisma.membership.findMany({ where: { companyId, enabled: true, userId: { in: ids }, user: { isBot: false } }, select: { userId: true } });
    const allowed = members.map((member) => member.userId);
    if (!allowed.length) return {};
    const rows = await prisma.userPreference.findMany({ where: { userId: { in: allowed }, key: { in: [STATUS_KEY, DND_KEY] } }, select: { userId: true, key: true, value: true } });
    const out = {};
    for (const row of rows) {
      out[row.userId] ??= { emoji: "", text: "", dnd: false };
      if (row.key === STATUS_KEY) {
        const status = activeStatus(row.value, now());
        if (status) { out[row.userId].emoji = status.emoji; out[row.userId].text = status.text; out[row.userId].expiresAt = status.expiresAt; }
      } else out[row.userId].dnd = isInDnd(row.value, now());
    }
    return Object.fromEntries(Object.entries(out).filter(([, value]) => value.emoji || value.text || value.dnd));
  }

  return { getStatus, setStatus, getDnd, setDnd, lookup };
}
