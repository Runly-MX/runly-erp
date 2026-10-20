// Inline record links in chat text. Stored: #[entityType:uuid:Display name];
// shown in the composer as #[Display name]. Mirrors the @[uuid:name] mention
// token (components/MentionTextarea.jsx) but carries the record type, so it
// can be resolved and previewed without a lookup.
export const ENTITY_TOKEN_SOURCE = /#\[([a-z_]+):([a-f0-9-]{36}):([^\]]+)\]/.source;

export function parseEntityTokens(text) {
  if (!text) return [];
  const re = new RegExp(ENTITY_TOKEN_SOURCE, "g");
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push({ entityType: m[1], recordId: m[2], name: m[3] });
  return out;
}

// "#[inventory_item:uuid:Laptop]" -> "Laptop", for places that show text only.
export function stripEntityTokens(text) {
  return String(text ?? "").replace(new RegExp(ENTITY_TOKEN_SOURCE, "g"), "$3");
}
