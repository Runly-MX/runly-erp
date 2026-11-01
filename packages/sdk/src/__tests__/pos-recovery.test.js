import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunlyClient } from '../index.js';
import { createPosRecoveryDomain } from '../domains/pos-recovery.js';

test('commerce SDK carries stable keys, active company, expectedVersion and decimal amounts', async () => {
  const seen = [];
  const client = createRunlyClient({ baseUrl: 'https://example.test', getActiveCompanyId: () => 'company-a',
    fetch: async (url, options) => { seen.push({ url, options }); return Response.json({ data: { ok: true } }); } });
  const data = { expectedVersion: 3, amount: '100.00', tenderedAmount: '200.00' };
  const options = { idempotencyKey: 'commerce-attempt-0001' };
  await client.commerce.addPayment('order', data, 'test-token', options);
  await client.commerce.addPayment('order', data, 'test-token', options);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url, 'https://example.test/pos/v2/orders/order/payments');
  assert.deepEqual(seen[0], seen[1]);
  assert.equal(seen[0].options.headers['Idempotency-Key'], options.idempotencyKey);
  assert.equal(seen[0].options.headers['X-Runly-Company-Id'], 'company-a');
  assert.deepEqual(JSON.parse(seen[0].options.body), data);
  await assert.rejects(client.commerce.addPayment('order', data, 'test-token'), { code: 'IDEMPOTENCY_REQUIRED' });
  assert.equal(seen.length, 2);
});

test('SDK exposes structured commerce errors', async () => {
  const client = createRunlyClient({ baseUrl: 'https://example.test', fetch: async () => Response.json({ error: {
    code: 'REFUND_REQUIRED', message: 'Devuelve el anticipo.' }, requestId: 'support-example' }, { status: 409 }) });
  await assert.rejects(client.commerce.cancel('order', { expectedVersion: 1, reason: 'Error' }, 'test-token', { idempotencyKey: 'commerce-attempt-0002' }),
    (err) => err.code === 'REFUND_REQUIRED' && err.message === 'Devuelve el anticipo.' && err.requestId === 'support-example' && err.status === 409);
});

test('commerce commands set onlineOnly including DELETE and preserve caller keys', async () => {
  const calls = [];
  const domain = createPosRecoveryDomain({ request: async (...args) => calls.push(args), withAuthHeaders: (_token, headers) => headers, toQueryString: () => '' });
  await domain.addPayment('order', {}, 'test-token', { idempotencyKey: 'commerce-attempt-0003' });
  await domain.deleteLine('order','line',{expectedVersion:1},'test-token',{ idempotencyKey: 'commerce-attempt-0004' });
  assert.ok(calls.every(([,options])=>options.onlineOnly===true));
  assert.equal(calls[1][1].method,'DELETE');
});
