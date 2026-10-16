import { z } from 'zod';

// RFC 7591 §2 / RFC 6749 §3: ignore extensions, never persist or trust them.
// Known fields still pass a strict schema. Diagnostics contain only schema-owned
// names and issue codes, never values, Zod messages, or attacker-controlled keys.
export function parseOAuth(schema, input, registration = false) {
  const known = new Set(Object.keys(schema.shape));
  const projected = input && typeof input === 'object' && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input).filter(([key]) => known.has(key))) : input;
  const result = schema.safeParse(projected);
  if (result.success) return result.data;
  const validationIssues = result.error.issues.slice(0, 20).map(issue => ({
    field: known.has(issue.path[0]) ? issue.path[0] : '$',
    code: issue.code,
  }));
  const code = registration ? validationIssues.some(issue => issue.field === 'redirect_uris') ? 'invalid_redirect_uri' : 'invalid_client_metadata' : 'invalid_request';
  throw Object.assign(new Error('Invalid OAuth parameters.'), { status: 400, code, validationIssues });
}

export function oauthParameters(params) {
  const result = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key)) throw Object.assign(new Error('Repeated OAuth parameter.'), { status: 400, code: 'invalid_request' });
    result[key] = value;
  }
  // RFC 6749 treats empty protocol parameters as omitted (not JSON metadata).
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== ''));
}

export const oauthScope = z.string().min(1).max(500).regex(/^[\x21\x23-\x5B\x5D-\x7E]+(?: [\x21\x23-\x5B\x5D-\x7E]+)*$/);
