import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { clientIp } from '../client-ip.js';
import { validateTrustedProxies } from '../../mcp/client-ip.js';

const ask = async (env, peer, xff) => {
  const app = new Hono();
  app.get('/', c => c.text(clientIp(c, env)));
  const res = await app.request('http://x/', { headers: xff ? { 'x-forwarded-for': xff } : {} }, { incoming: { socket: { remoteAddress: peer } } });
  return res.text();
};

test('direct client: forged X-Forwarded-For is ignored, with and without trusted proxies configured', async () => {
  assert.equal(await ask({}, '203.0.113.9', '1.2.3.4'), '203.0.113.9');
  assert.equal(await ask({ RUNLY_TRUSTED_PROXIES: '172.18.0.0/16' }, '203.0.113.9', '1.2.3.4'), '203.0.113.9');
});

test('trusted proxy: client address comes from the right, prepended forgeries are skipped', async () => {
  const env = { RUNLY_TRUSTED_PROXIES: '172.18.0.0/16, 10.0.0.5' };
  assert.equal(await ask(env, '172.18.0.3', '198.51.100.7'), '198.51.100.7');
  assert.equal(await ask(env, '172.18.0.3', '1.2.3.4, 198.51.100.7, 10.0.0.5'), '198.51.100.7');
});

test('falls back to RUNLY_MCP_TRUSTED_PROXIES; nothing configured trusts nobody', async () => {
  assert.equal(await ask({ RUNLY_MCP_TRUSTED_PROXIES: '172.18.0.3' }, '172.18.0.3', '198.51.100.7'), '198.51.100.7');
  assert.equal(await ask({}, '172.18.0.3', '198.51.100.7'), '172.18.0.3');
});

test('validateTrustedProxies names every invalid entry', () => {
  assert.deepEqual(validateTrustedProxies('10.0.0.0/8, private, loopback').invalid, []);
  assert.deepEqual(validateTrustedProxies('10.0.0.0/99, nope, 1.2.3.4').invalid, ['10.0.0.0/99', 'nope']);
  assert.equal(validateTrustedProxies('').ok, true);
});
