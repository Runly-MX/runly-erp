import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

for (const workspace of ['package.json', 'apps/api/package.json']) {
  const require = createRequire(new URL(`../../${workspace}`, import.meta.url));
  const { renderToString, renderToReadableStream } = await import(pathToFileURL(require.resolve('hono/jsx/dom/server')));
  const { Hono } = await import(pathToFileURL(require.resolve('hono')));
  test(`${workspace}: SSR root strings remain text`, () => {
    assert.equal(renderToString('<b>texto & "dato"</b>'), '&lt;b&gt;texto &amp; &quot;dato&quot;&lt;/b&gt;');
    assert.equal(renderToString(['<b>', '&']), '&lt;b&gt;&amp;');
  });
  test(`${workspace}: streamed SSR escapes root text`, async () => {
    const stream = await renderToReadableStream('<b>texto</b>');
    assert.equal(await new Response(stream).text(), '&lt;b&gt;texto&lt;/b&gt;');
  });
  test(`${workspace}: request middleware retains headers, params and JSON`, async () => {
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('company', c.req.header('X-Company-Id')); await next(); });
    app.post('/fixture/:id', async c => c.json({ id: c.req.param('id'), company: c.get('company'), body: await c.req.json() }, 201));
    const response = await app.request('/fixture/record', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Company-Id': 'fixture-company' }, body: JSON.stringify({ text: 'hola' }) });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: 'record', company: 'fixture-company', body: { text: 'hola' } });
  });
}
