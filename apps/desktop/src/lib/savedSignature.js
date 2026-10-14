// The user's saved signature (reusable across modules, spec inventory custody §9.6).
// GET|PUT|PATCH /profile/me/signature -> { signature: { url, allowDelegation, updatedAt } | null }
export function parseSavedSignature(res) {
  const raw = res && typeof res === 'object' && 'signature' in res ? res.signature : null
  if (!raw) return null
  return { url: raw.url ?? null, allowDelegation: Boolean(raw.allowDelegation), updatedAt: raw.updatedAt ?? null }
}
