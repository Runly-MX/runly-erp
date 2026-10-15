import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { normalizeSearchText, tokenizeSearch, escapeLike, likePattern, likeAny, buildTokenIntersectQuery } from '../search-tokens.js';

describe('search-tokens', () => {
  it('normalizes case and accents', () => assert.equal(normalizeSearchText('  JOSÉ Peña'), '  jose pena'));
  it('tokenizes with AND semantics rules', () => {
    assert.deepEqual(tokenizeSearch('Dell  Juan 2024'), ['dell', 'juan', '2024']);
    assert.deepEqual(tokenizeSearch('a'), ['a']);
    assert.deepEqual(tokenizeSearch('a dell'), ['dell']);
    assert.deepEqual(tokenizeSearch('   '), []);
    assert.deepEqual(tokenizeSearch('dell DELL'), ['dell']);
    assert.equal(tokenizeSearch('aa bb cc dd ee ff gg hh ii jj').length, 8);
    assert.equal(tokenizeSearch('x'.repeat(500))[0].length, 64);
  });
  it('escapes LIKE wildcards', () => {
    const bs = String.fromCharCode(92);
    assert.equal(escapeLike('50%_a' + bs + 'b'), '50' + bs + '%' + bs + '_a' + bs + bs + 'b');
    assert.equal(likePattern('a_b'), '%a' + bs + '_b%');
    assert.ok(likeAny(['x'], '%a%').sql.includes("ESCAPE '" + bs + "'"));
  });
  it('builds parameterised SQL without user text', () => {
    const evil = "x'; DROP TABLE inv_item;--";
    const sql = buildTokenIntersectQuery({
      tokens: ['dell', evil],
      sourcesFor: (p) => [Prisma.sql`SELECT i.id FROM inv_item i WHERE ${likeAny(['i.name', 'i.notes'], p)}`],
      base: Prisma.sql`SELECT id FROM inv_item WHERE company_id = ${'c1'}::uuid`,
    });
    assert.ok(!sql.sql.includes('DROP TABLE'));
    assert.ok(sql.values.includes('%dell%'));
    assert.ok(sql.values.includes(likePattern(evil)));
    assert.ok(sql.values.includes('c1'));
    assert.match(sql.sql, /t0 AS .* UNION|t1 AS/s);
    assert.throws(() => buildTokenIntersectQuery({ tokens: [], sourcesFor: () => [], base: Prisma.sql`SELECT 1` }));
  });
});
