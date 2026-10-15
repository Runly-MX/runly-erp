// Shared building blocks for global-search providers (see index.js).
// All user text travels as bound parameters (Prisma.sql); column lists, table
// names and ORDER BY fragments are trusted code, never user input.
import { Prisma } from "@prisma/client";
import { tokenizeSearch, likeAny, likePattern, escapeLike, normColumn } from "../../lib/search-tokens.js";

const LIKE_ESCAPE = Prisma.raw("'" + String.fromCharCode(92) + "'");

export function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

// Title that is never empty/"null".
export function safeTitle(fallback, ...values) {
  return firstNonEmpty(...values.map((v) => (v == null ? null : String(v)))) ?? fallback;
}

export function joinParts(parts, separator = " · ") {
  const clean = parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter((p) => p && p !== "null" && p !== "undefined");
  return clean.length ? clean.join(separator) : null;
}

export function fullName(first, last) {
  return joinParts([first, last], " ");
}

// Every token must match (AND); each token may match any column or extra source.
// extras(pattern) -> array of SQL boolean fragments OR-ed with the columns.
export function tokensWhere(tokens, columns, extras) {
  return Prisma.join(
    tokens.map((token) => {
      const pattern = likePattern(token);
      const parts = [likeAny(columns, pattern)];
      if (extras) parts.push(...extras(pattern));
      return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
    }),
    " AND ",
  );
}

// One company-scoped token search with total count (COUNT(*) OVER()).
//   from: trusted SQL string or Prisma.Sql; select/orderBy: trusted SQL strings; scope: Prisma.Sql boolean.
//   titleColumn drives relevance (prefix match first), orderBy breaks ties.
export async function tokenSearch(prisma, { q, from, select, scope, columns, extras, titleColumn, orderBy, limit, map }) {
  const tokens = tokenizeSearch(q);
  if (!tokens.length) return { items: [], total: 0 };
  const first = escapeLike(tokens[0]);
  const rank = titleColumn
    ? Prisma.sql`CASE WHEN ${normColumn(titleColumn)} LIKE ${`${first}%`} ESCAPE ${LIKE_ESCAPE} THEN 0
        WHEN ${normColumn(titleColumn)} LIKE ${`%${first}%`} ESCAPE ${LIKE_ESCAPE} THEN 1 ELSE 2 END`
    : Prisma.sql`0`;
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT ${Prisma.raw(select)}, COUNT(*) OVER() AS search_total
    FROM ${typeof from === "string" ? Prisma.raw(from) : from}
    WHERE ${scope} AND ${tokensWhere(tokens, columns, extras)}
    ORDER BY ${rank}, ${Prisma.raw(orderBy)}
    LIMIT ${Number(limit) || 5}`);
  const list = Array.isArray(rows) ? rows : [];
  return { items: list.map(map), total: list.length ? Number(list[0].search_total) : 0 };
}

export function defineProvider(def) {
  const provider = { icon: "Search", seeAllTarget: () => null, ...def };
  if (!provider.search) {
    // run()-only providers: wrap so the route can always call search().
    provider.search = async (ctx) => {
      const items = await def.run(ctx);
      return { items, total: items.length };
    };
  }
  if (!def.run) {
    provider.run = async (ctx) => (await provider.search(ctx)).items;
  }
  return provider;
}

export const enc = encodeURIComponent;
