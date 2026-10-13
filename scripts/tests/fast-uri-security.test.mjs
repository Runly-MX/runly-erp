import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';

const root = createRequire(new URL('../../package.json', import.meta.url));
const prisma = createRequire(realpathSync(root.resolve('prisma/package.json')));
const dev = createRequire(prisma.resolve('@prisma/dev'));
const streams = createRequire(dev.resolve('@prisma/streams-local'));
const ajvRequire = createRequire(streams.resolve('ajv'));
const uri = ajvRequire('fast-uri');

test('literal backslash authority agrees with WHATWG or is rejected', () => {
  const input = 'http://evil.test\\@allowed.test/';
  const parsed = uri.parse(input);
  assert.ok(parsed.error || parsed.host === new URL(input).hostname);
});
test('backslash authority introducers cannot resolve to a different host than WHATWG', () => {
  for (const input of ['\\\\evil.test/path', '/\\evil.test/path', '\\/evil.test/path']) {
    let result;
    try { result = uri.resolve('https://allowed.test/', input); } catch { continue; }
    const parsed = uri.parse(result);
    assert.ok(parsed.error || parsed.host === new URL(input, 'https://allowed.test/').hostname, input);
  }
});
test('malformed IPv6 literals are rejected', () => {
  assert.ok(uri.parse('http://[2001:db8::nothex]/').error);
});
test('nested encoded host must not become a live host after normalization', () => {
  let output;
  try { output = uri.normalize('http://%2561%256c%256c%256f%2577%2565%2564.test/'); } catch { return; }
  assert.throws(() => new URL(output));
});
test('encoded scheme must not introduce a live authority or raw newline', () => {
  for (const input of ['%2f%2fevil.test:/path', '%u002f%u002fevil.test:/path', 'http%0d%0a:/path']) {
    let output;
    try { output = uri.normalize(input); } catch { continue; }
    assert.ok(!output.startsWith('//') && !/[\r\n]/.test(output));
  }
});
test('invalid port components are rejected before recomposing the authority', () => {
  assert.throws(() => uri.serialize({ scheme: 'http', host: 'allowed.test', port: '@evil.test:8080', path: '/' }));
});
test('encoded uppercase host is canonical for scheme-relative references', () => {
  assert.equal(uri.parse('//%41.test').host, 'a.test');
  assert.equal(uri.equal('//%41.test', '//a.test'), true);
});
test('ordinary parse/resolve and real Ajv schema references remain intact', () => {
  assert.equal(uri.parse('https://example.test:8443/path?q=1').host, 'example.test');
  assert.equal(uri.resolve('https://example.test/base/', '../next'), 'https://example.test/next');
  const Ajv = streams('ajv').default;
  const validator = new Ajv();
  validator.addSchema({ $id: 'https://schema.example.test/numeric', type: 'integer', minimum: 1 });
  const validate = validator.compile({ type: 'object', properties: { count: { $ref: 'https://schema.example.test/numeric' } }, required: ['count'], additionalProperties: false });
  assert.equal(validate({ count: 2 }), true);
  assert.equal(validate({ count: 0 }), false);
  assert.equal(validate({ count: 2, extra: true }), false);
});
