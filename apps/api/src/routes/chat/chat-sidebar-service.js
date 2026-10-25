// apps/api/src/routes/chat/chat-sidebar-service.js
//
// Per-person organization of the chat sidebar: custom sections ("carpetas"), which
// conversation lives in which section, collapsed state and the quick filter. Stored
// in UserPreference (key `chat.sidebar`), so it needs no migration. Spec
// docs/superpowers/specs/2026-10-26-chat-organization-design.md, section 1.
import { ChatServiceError } from "./chat-service-error.js";

export const SIDEBAR_KEY = "chat.sidebar";
export const AUTO_SECTIONS = ["starred", "channels", "direct", "meetings", "support"];
export const FILTERS = ["all", "unread", "mentions"];
export const MAX_SECTIONS = 20;
export const MAX_NAME = 40;
const MAX_ASSIGNMENTS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clean = (value, max) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);

// Always returns a valid state; anything unknown is dropped (pure, exported for tests).
export function normalizeSidebar(input) {
  const raw = input && typeof input === "object" ? input : {};
  const seen = new Set();
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((section) => ({ id: String(section?.id ?? ""), name: clean(section?.name, MAX_NAME), icon: clean(section?.icon, 60) || null, collapsed: section?.collapsed === true }))
    .filter((section) => UUID.test(section.id) && section.name && !seen.has(section.id) && seen.add(section.id))
    .slice(0, MAX_SECTIONS);
  const assignments = {};
  for (const [conversationId, sectionId] of Object.entries(raw.assignments && typeof raw.assignments === "object" ? raw.assignments : {}).slice(0, MAX_ASSIGNMENTS)) {
    if (UUID.test(conversationId) && seen.has(sectionId)) assignments[conversationId] = sectionId;
  }
  const collapsed = {};
  for (const key of AUTO_SECTIONS) if (raw.collapsed?.[key] === true || raw.collapsed?.[key] === false) collapsed[key] = raw.collapsed[key];
  const order = [...new Set((Array.isArray(raw.order) ? raw.order : []).filter((key) => AUTO_SECTIONS.includes(key)))];
  const hidden = [...new Set((Array.isArray(raw.hidden) ? raw.hidden : []).filter((key) => AUTO_SECTIONS.includes(key)))];
  const filter = FILTERS.includes(raw.filter) ? raw.filter : "all";
  return { sections, assignments, collapsed, order, hidden, filter };
}

export function createChatSidebarService({ prisma }) {
  async function get(userId) {
    const row = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key: SIDEBAR_KEY } }, select: { value: true } });
    return normalizeSidebar(row?.value);
  }

  async function put(userId, input) {
    if (input !== null && typeof input !== "object") throw new ChatServiceError("Datos no válidos.", 400);
    const state = normalizeSidebar(input);
    // Only conversations the person belongs to can be organized.
    const ids = Object.keys(state.assignments);
    if (ids.length) {
      const rows = await prisma.$queryRaw`
        SELECT conversation_id FROM chat_conversation_members
        WHERE user_id = ${userId}::uuid AND left_at IS NULL AND conversation_id = ANY(${ids}::uuid[])
      `;
      const mine = new Set(rows.map((row) => row.conversation_id.toString()));
      for (const id of ids) if (!mine.has(id)) delete state.assignments[id];
    }
    await prisma.userPreference.upsert({ where: { userId_key: { userId, key: SIDEBAR_KEY } }, update: { value: state }, create: { userId, key: SIDEBAR_KEY, value: state } });
    return state;
  }

  return { get, put };
}
