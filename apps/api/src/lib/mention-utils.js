export function parseMentionIds(body) {
  if (!body) return []
  const regex = /@\[([a-f0-9-]{36}):[^\]]+\]/g
  const ids = []
  let m
  while ((m = regex.exec(body)) !== null) ids.push(m[1])
  return [...new Set(ids)]
}

// Turn the stored @[uuid:Display Name] mention tokens into a readable "@Display
// Name" — for previews, search snippets, LLM input, anything that shows the
// body as text rather than rendering mention chips.
const MENTION_TOKEN_RE = /@\[[0-9a-fA-F-]{36}:([^\]]+)\]/g
// Record links (#[entityType:uuid:Name], see packages/ui entityTokens) read as just the name.
const ENTITY_TOKEN_RE = /#\[[a-z_]+:[0-9a-fA-F-]{36}:([^\]]+)\]/g
export function stripMentionTokens(body) {
  return String(body ?? '').replace(MENTION_TOKEN_RE, '@$1').replace(ENTITY_TOKEN_RE, '$1')
}
