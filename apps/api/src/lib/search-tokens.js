// Reusable multi-token, accent/case-insensitive substring search helpers.
//
// Semantics: the query is split into tokens; every token must match (AND) but
// each token may match ANY source (columns, related tables...). All user text
// travels as bound parameters (Prisma.sql), never concatenated into SQL.
//
// Pattern for a module (see docs/ai-context/rme3-runtime-capabilities.md):
//   const tokens = tokenizeSearch(term);
//   const sql = buildTokenIntersectQuery({
//     tokens,
//     sourcesFor: (pattern) => [Prisma.sql`SELECT id FROM t WHERE ${likeAny(['t.name','t.email'], pattern)}`],
//     base: Prisma.sql`SELECT id FROM t WHERE company_id = ${companyId}::uuid`,
//   });
import { Prisma } from '@prisma/client';

export const SEARCH_MAX_TOKENS = 8;
export const SEARCH_MAX_TOKEN_LENGTH = 64;
export const SEARCH_MIN_TOKEN_LENGTH = 2;

// Mirror of the SQL atlas_unaccent(lower(x)): lower-case + strip diacritics.
export function normalizeSearchText(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase();
}

// Tokens of 2+ chars; a lone 1-char token is kept only when it is the only
// token. Deduplicated, capped in count and length.
export function tokenizeSearch(raw, { maxTokens = SEARCH_MAX_TOKENS, maxLength = SEARCH_MAX_TOKEN_LENGTH } = {}) {
  const parts = normalizeSearchText(raw).split(/\s+/).filter(Boolean).map((t) => t.slice(0, maxLength));
  const unique = [...new Set(parts)];
  if (unique.length === 1) return unique;
  return unique.filter((t) => t.length >= SEARCH_MIN_TOKEN_LENGTH).slice(0, maxTokens);
}

const LIKE_ESCAPE_SQL = Prisma.raw("'" + String.fromCharCode(92) + "'");

export function escapeLike(token) {
  return String(token).replace(/[\\%_]/g, (ch) => '\\' + ch);
}

// Bound-parameter value for `... LIKE $n ESCAPE '\'`.
export function likePattern(token) {
  return `%${escapeLike(token)}%`;
}

// Normalised SQL expression of a column (identifier is trusted code, not user text).
export function normColumn(column) {
  return Prisma.sql`atlas_unaccent(lower(coalesce((${Prisma.raw(column)})::text, '')))`;
}

// `col1 LIKE $p OR col2 LIKE $p ...` against already-built pattern.
export function likeAny(columns, pattern) {
  const parts = columns.map((column) => Prisma.sql`${normColumn(column)} LIKE ${pattern} ESCAPE ${LIKE_ESCAPE_SQL}`);
  return Prisma.join(parts, ' OR ');
}

// WITH t0 AS (src UNION src...), t1 AS (...) SELECT id FROM (base) b WHERE id IN t0 AND id IN t1
// `base` must select an `id` column. `sourcesFor(pattern)` returns SELECT-id fragments.
export function buildTokenIntersectQuery({ tokens, sourcesFor, base, limit = 5000 }) {
  if (!tokens.length) throw new Error('tokens required');
  const ctes = tokens.map((token, index) => {
    const pattern = likePattern(token);
    return Prisma.sql`${Prisma.raw(`t${index}`)} AS (${Prisma.join(sourcesFor(pattern), ' UNION ')})`;
  });
  const filters = tokens.map((_, index) => Prisma.sql`b.id IN (SELECT id FROM ${Prisma.raw(`t${index}`)})`);
  const cap = Math.max(1, Math.min(Number(limit) || 5000, 20000));
  return Prisma.sql`WITH ${Prisma.join(ctes, ', ')}, b AS (${base}) SELECT b.id FROM b WHERE ${Prisma.join(filters, ' AND ')} LIMIT ${cap}`;
}
