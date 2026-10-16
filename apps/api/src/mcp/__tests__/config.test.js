import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mcpConfig } from '../config.js';

test('incomplete enabled MCP is disabled with a diagnostic and ERP startup can continue', () => {
  const messages = [];
  assert.equal(mcpConfig({ RUNLY_MCP_ENABLED: 'true', RUNLY_MCP_PUBLIC_URL: ' ' }, message => messages.push(message)), null);
  assert.match(messages[0], /Servicio deshabilitado.*RUNLY_MCP_PUBLIC_URL.*RUNLY_MCP_WEB_URL/);
});
test('disabled MCP needs no URLs and logs no warnings', () => {
  for (const enabled of [undefined, '', 'false']) assert.equal(mcpConfig({ RUNLY_MCP_ENABLED: enabled }, () => assert.fail()), null);
});
test('invalid URLs disable MCP without leaking configuration values', () => {
  const messages = [];
  for (const url of ['invalid', 'http://unsafe.example/mcp', 'https://user:fixture@erp.example/mcp', 'https://erp.example/wrong']) {
    assert.equal(mcpConfig({ RUNLY_MCP_ENABLED: 'true', RUNLY_MCP_PUBLIC_URL: url, RUNLY_MCP_WEB_URL: 'https://web.example' }, message => messages.push(message)), null);
  }
  assert.ok(messages.every(message => !/unsafe.example|user|fixture|web.example/.test(message)));
});
test('valid configured MCP retains exact URLs and allows an empty additional origin list', () => {
  assert.equal(mcpConfig({ RUNLY_MCP_ENABLED: 'true', RUNLY_MCP_PUBLIC_URL: 'https://erp.example/mcp', RUNLY_MCP_WEB_URL: 'https://web.example', RUNLY_MCP_ALLOWED_ORIGINS: '' }).resource, 'https://erp.example/mcp');
});
