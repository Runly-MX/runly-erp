// Vendored from runly-developer-hub packages/contracts/registry.js; the signature vector test pins both copies.
// Subdomain registry contract shared by the Hub (authority) and Runly installations (clients).
// The registry is the only authority over names; an installation never decides uniqueness.
// Dependency-free so installations can vendor a byte-identical copy; vectors in the tests pin it.
export const REGISTRY_BASE = '/registry/v1';
export const NAME_STATES = ['pending', 'assigned', 'suspended', 'revoked', 'quarantined'];
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;
export const RESERVED_SLUGS = new Set(['admin', 'api', 'app', 'auth', 'login', 'public', 'preview', 'support', 'status', 'www', 'mail', 'erp', 'mcp', 'runly', 'atlas', 'internal', 'system', 'billing', 'pay', 'payments', 'checkout', 'help', 'docs', 'blog', 'cdn', 'static', 'assets', 'dashboard', 'root', 'security']);
export const RESERVED_PREFIX = /^(?:runly|atlas|internal|system|admin|api|auth)-/;
// Names that read like a protected brand once look-alike digits are folded back to letters.
export const PROTECTED_BRANDS = ['runly', 'atlas', 'stripe', 'paypal', 'google', 'microsoft', 'apple', 'amazon', 'facebook', 'meta', 'whatsapp', 'github', 'cloudflare', 'bbva', 'banorte', 'santander', 'citibanamex'];
const FOLD = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't' };
// '1' reads as either i or l, so both foldings are compared.
export const skeletons = (slug) => ['i', 'l'].map((one) => slug.replace(/-/g, '').replace(/1/g, one).replace(/[03457]/g, (digit) => FOLD[digit]));

// Returns null when the slug may be claimed, otherwise the stable reason code.
export function slugProblem(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug) || slug.includes('--')) return 'SLUG_INVALID';
  if (RESERVED_SLUGS.has(slug) || RESERVED_PREFIX.test(slug)) return 'NAME_RESERVED';
  // Exact look-alikes of any brand, and anything that begins like the house brands.
  if (skeletons(slug).some((folded) => PROTECTED_BRANDS.includes(folded) || ['runly', 'atlas'].some((house) => folded.startsWith(house)))) return 'NAME_RESERVED';
  return null;
}
export const NAMESPACE_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

// Canonical string an installation signs (Ed25519, base64url). Every field is bound, so a signature
// cannot be replayed on another path, body, key or time.
export function signingString({ method, path, timestamp, nonce, bodySha256, idempotencyKey = '' }) {
  return [String(method).toUpperCase(), path, String(timestamp), nonce, bodySha256, idempotencyKey].join('\n');
}
export const HEADERS = { installation: 'x-runly-installation', timestamp: 'x-runly-timestamp', nonce: 'x-runly-nonce', signature: 'x-runly-signature', idempotency: 'idempotency-key' };
export const MAX_SKEW_SECONDS = 300;
