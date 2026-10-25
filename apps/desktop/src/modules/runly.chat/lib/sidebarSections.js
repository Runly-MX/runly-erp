// Pure rules of the chat sidebar: which section each conversation lives in, the quick
// filters and the section order. Spec docs/superpowers/specs/2026-10-26-chat-organization-design.md.

export const AUTO_LABELS = {
  starred: "Destacados",
  channels: "Canales",
  direct: "Mensajes directos",
  meetings: "Reuniones",
  support: "Soporte externo",
};
export const AUTO_ORDER = ["starred", "channels", "direct", "meetings", "support"];

export const DEFAULT_SIDEBAR = { sections: [], assignments: {}, collapsed: {}, order: [], hidden: [], filter: "all" };

// Channels created by a call are tagged; older ones are recognised by their generated name.
export function isMeeting(conversation) {
  if (conversation?.type !== "channel") return false;
  if (conversation.metadata?.origin === "meeting") return true;
  return !conversation.metadata?.origin && !conversation.is_public && /^Reuni[óo]n \d{1,2} /i.test(conversation.title ?? "");
}

// Automatic section of a conversation (before the person's own sections).
export function autoSectionOf(conversation) {
  if (conversation.is_pinned) return "starred";
  if (conversation.type === "external_support") return "support";
  if (isMeeting(conversation)) return "meetings";
  if (conversation.type === "channel") return "channels";
  return "direct";
}

export function matchesFilter(conversation, filter) {
  if (filter === "unread") return (conversation.unread_count ?? 0) > 0 || (conversation.unread_mention_count ?? 0) > 0;
  if (filter === "mentions") return (conversation.unread_mention_count ?? 0) > 0;
  return true;
}

// conversations: server list. Returns { mirai, sections } where each section is
// { key, kind: "auto"|"custom", id?, label, icon?, collapsed, items, unread, mentions }.
// Custom sections always show (so rows can be dropped into them); automatic ones only when they have rows.
export function buildSections({ conversations, state = DEFAULT_SIDEBAR, filter = state.filter ?? "all" }) {
  const customById = new Map(state.sections.map((section) => [section.id, section]));
  const buckets = new Map();
  const mirai = [];
  for (const conversation of conversations ?? []) {
    if (conversation.type === "mirai") { mirai.push(conversation); continue; }
    if (!matchesFilter(conversation, filter)) continue;
    const customId = state.assignments?.[conversation.id];
    const key = customId && customById.has(customId) ? `custom:${customId}` : autoSectionOf(conversation);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(conversation);
  }
  const make = (key, base, items) => ({
    ...base, key, items,
    unread: items.reduce((sum, item) => sum + (item.unread_count ?? 0), 0),
    mentions: items.reduce((sum, item) => sum + (item.unread_mention_count ?? 0), 0),
  });
  const autoKeys = [...new Set([...(state.order ?? []).filter((key) => AUTO_ORDER.includes(key)), ...AUTO_ORDER])].filter((key) => !state.hidden?.includes(key));
  const autos = autoKeys
    .filter((key) => buckets.get(key)?.length)
    .map((key) => make(key, { kind: "auto", label: AUTO_LABELS[key], collapsed: state.collapsed?.[key] ?? key === "meetings" }, buckets.get(key)));
  const customs = state.sections
    .filter((section) => (filter === "all" ? true : buckets.get(`custom:${section.id}`)?.length))
    .map((section) => make(`custom:${section.id}`, { kind: "custom", id: section.id, label: section.name, icon: section.icon, collapsed: section.collapsed === true }, buckets.get(`custom:${section.id}`) ?? []));
  // Destacados first, then the person's sections, then the rest.
  const sections = [...autos.filter((section) => section.key === "starred"), ...customs, ...autos.filter((section) => section.key !== "starred")];
  return { mirai, sections };
}
