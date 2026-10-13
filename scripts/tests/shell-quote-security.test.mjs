import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
// Exercise the dependency resolved by concurrently, not an unrelated root copy.
const shellQuote = require(require.resolve('shell-quote', { paths: [dirname(require.resolve('concurrently'))] }));

test('concurrently shell quoting rejects line terminators after a comment token', () => {
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) {
    // Strings only: this test never launches the generated shell command.
    assert.throws(() => shellQuote.quote(['echo', 'ok', { comment: 'fixture' }, `a${separator}id;#`]), TypeError);
  }
});

test('concurrently shell parsing preserves ordinary Runly development arguments', () => {
  for (const tokens of [['pnpm', 'dev:api'], ['pnpm', '--filter', '@runly/desktop', 'dev:web'], ['echo', 'Hola mundo']]) {
    assert.deepEqual(shellQuote.parse(shellQuote.quote(tokens)), tokens);
  }
});
