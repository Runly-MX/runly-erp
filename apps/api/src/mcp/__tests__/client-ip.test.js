import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustedProxies, resolveClientIp } from '../client-ip.js';

const quiet = () => {};

test('without trusted proxies the socket peer is used and X-Forwarded-For is ignored', () => {
  const trusted = parseTrustedProxies('', quiet);
  assert.equal(resolveClientIp('::ffff:10.0.0.1', '198.51.100.7', trusted), '10.0.0.1');
  assert.equal(resolveClientIp(undefined, '198.51.100.7', trusted), 'direct');
});

test('an untrusted peer cannot choose its quota key through forwarding headers', () => {
  const trusted = parseTrustedProxies('10.0.0.0/8', quiet);
  assert.equal(resolveClientIp('203.0.113.9', '198.51.100.7', trusted), '203.0.113.9');
});

test('trusted hops are skipped right-to-left, ignoring addresses prepended by the client', () => {
  const trusted = parseTrustedProxies('private', quiet);
  assert.equal(resolveClientIp('::ffff:10.0.0.1', '203.0.113.1, 198.51.100.7, 192.168.0.1', trusted), '198.51.100.7');
  assert.equal(resolveClientIp('10.0.0.1', '', trusted), '10.0.0.1');
  assert.equal(resolveClientIp('10.0.0.1', 'garbage, 198.51.100.7', trusted), '198.51.100.7');
  assert.equal(resolveClientIp('10.0.0.1', '198.51.100.7, garbage', trusted), '10.0.0.1');
});

test('parses exact IPs, CIDR, IPv6 and reports invalid entries by name', () => {
  const warnings = [];
  const trusted = parseTrustedProxies('192.0.2.10, 2001:db8::/32, nope, 10.0.0.0/99', message => warnings.push(message));
  assert.equal(trusted.has('192.0.2.10'), true);
  assert.equal(trusted.has('192.0.2.11'), false);
  assert.equal(trusted.has('2001:db8::1'), true);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /nope/);
});
