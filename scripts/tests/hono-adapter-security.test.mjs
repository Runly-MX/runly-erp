import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';

const root = createRequire(new URL('../../package.json', import.meta.url));
const prisma = createRequire(realpathSync(root.resolve('prisma/package.json')));
const dev = createRequire(prisma.resolve('@prisma/dev'));
const { Hono } = dev('hono');
const { serveStatic } = dev('@hono/node-server/serve-static');

async function staticFixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'runly-hono-static-'));
  try {
    await mkdir(join(directory, 'admin'));
    await writeFile(join(directory, 'admin', 'sentinel.txt'), 'private-fixture');
    await writeFile(join(directory, 'public.txt'), 'public-fixture');
    const app = new Hono();
    app.use('/admin/*', c => c.text('Denied', 401));
    app.use('*', serveStatic({ root: directory }));
    await run(app);
  } finally {
    const absolute = await realpath(directory);
    assert.equal(absolute, resolve(directory));
    assert.ok(absolute.startsWith(join(await realpath(tmpdir()), 'runly-hono-static-')));
    await rm(absolute, { recursive: true });
  }
}

test('Prisma adapter rejects repeated separators before serving protected static content', () => staticFixture(async app => {
  for (const path of ['//admin/sentinel.txt', '/admin//sentinel.txt']) {
    const response = await app.request(`http://fixture.test${path}`);
    assert.notEqual(await response.text(), 'private-fixture', path);
  }
}));

test('Prisma adapter rejects encoded Windows separators before serving protected content', { skip: process.platform !== 'win32' }, () => staticFixture(async app => {
  const response = await app.request('http://fixture.test/admin%5Csentinel.txt');
  assert.notEqual(await response.text(), 'private-fixture');
}));

test('normal static, HEAD, range and auth guard remain intact', () => staticFixture(async app => {
  assert.equal(await (await app.request('/public.txt')).text(), 'public-fixture');
  assert.equal((await app.request('/admin/sentinel.txt')).status, 401);
  const head = await app.request('/public.txt', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const range = await app.request('/public.txt', { headers: { Range: 'bytes=0-5' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), 'public');
}));

test('Prisma adapter serves ordinary Hono HTTP on an ephemeral loopback port', async () => {
  const app = new Hono();
  app.post('/echo', async c => c.json({ text: await c.req.text(), header: c.req.header('X-Fixture') }));
  const server = dev('@hono/node-server').serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  try {
    if (!server.listening) await once(server, 'listening');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/echo`, { method: 'POST', body: 'hola', headers: { 'X-Fixture': 'fixture' } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: 'hola', header: 'fixture' });
  } finally {
    server.closeAllConnections();
    await new Promise((yes, no) => server.close(error => error ? no(error) : yes()));
  }
});
