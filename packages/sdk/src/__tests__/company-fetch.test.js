import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyFetch, createRunlyClient } from '../index.js';

test('company transport scopes every request and preserves multipart, custom headers and cancellation', async () => {
  let company = 'a';
  const calls = [];
  const fetch = createCompanyFetch({ getBaseUrl: () => 'https://api.example.test/v1', getCompanyId: () => company,
    fetchImpl: async (...args) => { calls.push(args); return new Response('{}'); } });
  const body = new FormData(); body.append('file', new Blob(['test']), 'test.txt');
  const signal = new AbortController().signal;
  await fetch('https://api.example.test/v1/files/upload', { method: 'POST', body, signal, headers: { Authorization: 'Bearer test' } });
  assert.equal(calls[0][1].headers.get('X-Runly-Company-Id'), 'a');
  assert.equal(calls[0][1].headers.get('Content-Type'), null);
  assert.equal(calls[0][1].body, body);
  assert.equal(calls[0][1].signal, signal);
  company = 'b';
  await fetch(new Request('https://api.example.test/v1/items', { headers: { Authorization: 'Bearer test' } }), { headers: new Headers({ Accept: 'application/json' }) });
  assert.equal(calls[1][1].headers.get('X-Runly-Company-Id'), 'b');
  assert.equal(calls[1][1].headers.get('Authorization'), 'Bearer test');
  assert.equal(calls[1][1].headers.get('Accept'), 'application/json');
  await assert.rejects(fetch('https://api.example.test/v1/items', { headers: { 'x-runly-company-id': 'a' } }), { code: 'company_changed' });
  for (const url of ['https://other.example.test/v1/items', 'https://api.example.test/v10/items', 'https://api.example.test/other']) {
    await assert.rejects(fetch(url), { code: 'invalid_api_origin' });
  }
  company = null;
  await assert.rejects(fetch('https://api.example.test/v1/items'), { code: 'company_required' });
  assert.equal(calls.length, 2);
});

test('late responses cannot update the next company in either transport', async (t) => {
  let company = 'a';
  const transport = createCompanyFetch({ getBaseUrl: () => 'https://api.example.test', getCompanyId: () => company,
    fetchImpl: async () => { company = 'b'; return new Response('{}'); } });
  await assert.rejects(transport('https://api.example.test/items'), { code: 'company_changed' });
  company = 'a';
  const slowBody = createCompanyFetch({ getBaseUrl: () => 'https://api.example.test', getCompanyId: () => company,
    fetchImpl: async () => ({ ok: true, json: async () => { company = 'b'; return {}; } }) });
  const response = await slowBody('https://api.example.test/items');
  await assert.rejects(response.json(), { code: 'company_changed' });
  company = 'a';
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => { company = 'b'; return { private: true }; } }));
  const client = createRunlyClient({ baseUrl: 'https://api.example.test', getActiveCompanyId: () => company });
  await assert.rejects(client.auth.me('test'), { code: 'company_changed' });
});

test('module ZIP upload includes company without overriding multipart boundary', async (t) => {
  let headers;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { headers = new Headers(options.headers); return { ok: true, json: async () => ({}) }; });
  const client = createRunlyClient({ baseUrl: 'https://api.example.test', getActiveCompanyId: () => 'a' });
  await client.modules.uploadModuleZip('custom.example', new FormData(), 'test');
  assert.equal(headers.get('X-Runly-Company-Id'), 'a');
  assert.equal(headers.get('Content-Type'), null);
});

test('SDK checks company after a pending JSON body resolves', async (t) => {
  for (const nextCompany of ['b', null, 'a']) {
    await t.test(`active company becomes ${nextCompany}`, async () => {
      let company = 'a';
      let releaseBody;
      let bodyStarted;
      const started = new Promise((resolve) => { bodyStarted = resolve; });
      const body = new Promise((resolve) => { releaseBody = resolve; });
      const client = createRunlyClient({
        baseUrl: 'https://api.example.test', getActiveCompanyId: () => company,
        fetch: async (_url, options) => {
          assert.equal(new Headers(options.headers).get('X-Runly-Company-Id'), 'a');
          return { ok: true, json: () => { bodyStarted(); return body; } };
        },
      });
      const pending = client.auth.me('test');
      const result = nextCompany === 'a'
        ? pending.then((value) => assert.deepEqual(value, { private: true }))
        : assert.rejects(pending, { code: 'company_changed', status: 409 });
      await started;
      company = nextCompany;
      releaseBody({ private: true });
      await result;
    });
  }
});

test('SDK preserves Blob rejection and multipart scoping on company changes', async () => {
  let company = 'a';
  const client = createRunlyClient({
    baseUrl: 'https://api.example.test', getActiveCompanyId: () => company,
    fetch: async (_url, options) => {
      assert.equal(new Headers(options.headers).get('X-Runly-Company-Id'), 'a');
      return { ok: true, blob: async () => { company = 'b'; return new Blob(['private']); } };
    },
  });
  await assert.rejects(client.files.downloadOfficeFile('example', 'test'), { code: 'company_changed', status: 409 });
  company = 'a';
  const multipartClient = createRunlyClient({
    baseUrl: 'https://api.example.test', getActiveCompanyId: () => company,
    fetch: async (_url, options) => {
      assert.ok(options.body instanceof FormData);
      assert.equal(new Headers(options.headers).get('Content-Type'), null);
      assert.equal(new Headers(options.headers).get('X-Runly-Company-Id'), 'a');
      return { ok: true, json: async () => { company = 'b'; return { uploaded: true }; } };
    },
  });
  await assert.rejects(multipartClient.modules.uploadModuleZip('custom.example', new FormData(), 'test'), { code: 'company_changed', status: 409 });
});

test('SDK preserves empty responses, unscoped calls, JSON errors and HTTP details', async (t) => {
  for (const status of [204, 205]) {
    const client = createRunlyClient({ fetch: async () => ({ ok: true, status, json: () => assert.fail('empty response must not consume JSON') }) });
    assert.equal(await client.health(), null);
  }
  let company = 'a';
  const client = createRunlyClient({ getActiveCompanyId: () => company,
    fetch: async () => ({ ok: true, json: async () => { company = 'b'; return { public: true }; } }) });
  assert.deepEqual(await client.health(), { public: true });
  await t.test('invalid JSON retains parsing error', async () => {
    const parseError = new SyntaxError('invalid JSON');
    const client = createRunlyClient({ fetch: async () => ({ ok: true, json: async () => { throw parseError; } }) });
    await assert.rejects(client.health(), (error) => error === parseError);
  });
  await t.test('HTTP error retains its details', async () => {
    const client = createRunlyClient({ fetch: async () => new Response('{"error":"denied"}', { status: 403 }) });
    await assert.rejects(client.health(), { message: 'denied', status: 403, responseText: '{"error":"denied"}', details: { error: 'denied' } });
  });
});

test('SDK keeps offline queued mutations scoped without consuming a response', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  const queued = { queued: true };
  const client = createRunlyClient({ getActiveCompanyId: () => 'a', fetch: async () => assert.fail('queued mutation must not fetch') });
  client.setOfflineTransport({ queue: async (path, options) => {
    assert.equal(path, '/profile/me');
    assert.equal(new Headers(options.headers).get('X-Runly-Company-Id'), 'a');
    return queued;
  } });
  assert.equal(await client.profile.updateMe({ name: 'Example' }, 'test'), queued);
});
