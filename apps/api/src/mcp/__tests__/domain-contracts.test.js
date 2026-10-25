import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createCapabilityRegistry } from '../registry.js';
import { createChatAdapter } from '../adapters/readonly.js';
import { fingerprint, isSensitive } from '../domain-runtime.js';
import { SCOPES } from '../config.js';
import { PERMISSION_CATALOG } from '../../permission-catalog.js';

test('registro: contratos estrictos, scopes declarados y superficie controlada', () => {
  const registry = createCapabilityRegistry({ prisma: {} });
  assert.equal(registry.tools.length, 61);
  assert.ok(SCOPES.join(' ').length <= 500);
  assert.equal(new Set(registry.tools.map(tool => tool.name)).size, registry.tools.length);
  for (const tool of registry.tools) {
    assert.ok(SCOPES.includes(tool.scope));
    assert.equal(tool.annotations.openWorldHint, Boolean(tool.fileImport));
    if (tool.fileImport) {
      assert.deepEqual(tool.meta['openai/fileParams'], ['files']);
      const schema = z.toJSONSchema(tool.inputSchema, { io: 'input' }).properties.files.items;
      assert.deepEqual(schema.required, ['download_url', 'file_id']);
      assert.deepEqual(Object.keys(schema.properties).sort(), ['download_url', 'file_id', 'file_name', 'mime_type']);
    }
    assert.ok(z.toJSONSchema(tool.inputSchema, { io: 'input' }));
    assert.ok(z.toJSONSchema(tool.outputSchema, { io: 'output' }));
    for (const operation of tool.operations) {
      assert.ok(PERMISSION_CATALOG[operation.permission], `Permiso ERP existente: ${operation.permission}`);
      if (operation.readPermission) assert.ok(PERMISSION_CATALOG[operation.readPermission], `Lectura ERP existente: ${operation.readPermission}`);
    }
    assert.ok(!/(delete|send_message|transfer|payment_execute|sql_query)/.test(tool.name));
  }
  // documents also proposes generating a document from a template (prepare / commit).
  assert.equal(registry.tools.filter(tool => tool.domain === 'documents').length, 3);
  for (const domain of ['attendance', 'identity', 'activity', 'chat']) {
    assert.equal(registry.tools.filter(tool => tool.domain === domain).length, 1);
    assert.equal(SCOPES.includes(`${domain}:write`), false);
  }
  const tool = registry.tools.find(tool => tool.name === 'runly_hr_prepare');
  assert.equal(tool.inputSchema.safeParse({ companyId: '01900000-0000-7000-8000-000000000001', request: { operation: 'sql', input: {} } }).success, false);
});

test('sensibilidad declarada por adaptador: misma matriz que la confirmación web', () => {
  const registry = createCapabilityRegistry({ prisma: {} });
  const sensitive = new Set(['runly.pfm', 'runly.ledger', 'runly.purchases', 'runly.calendar', 'runly.projects']);
  for (const moduleKey of registry.moduleKeys) {
    const adapter = registry.create(moduleKey);
    if (adapter.actions.length) assert.ok(['boolean', 'function'].includes(typeof adapter.sensitive), `${moduleKey} declara sensitive`);
    for (const definition of adapter.actions) {
      const expected = sensitive.has(moduleKey);
      if (moduleKey === 'runly.hr') {
        assert.equal(isSensitive(adapter, definition, { data: { firstName: 'Ana' } }), false);
        assert.equal(isSensitive(adapter, definition, { data: { userProfileId: null } }), true, 'Desvincular cuenta también es sensible');
      } else if (moduleKey === 'runly.website') {
        assert.equal(isSensitive(adapter, definition, {}), definition.key === 'website.pages.publish', 'Publicar expone páginas');
        if (definition.key === 'website.site.setup') assert.equal(isSensitive(adapter, definition, { useBuilder: true }), true, 'Cambiar el origen público es sensible');
      } else if (moduleKey === 'runly.catalog') {
        assert.equal(isSensitive(adapter, definition, { data: {} }), false);
        assert.equal(isSensitive(adapter, definition, { data: { published: true } }), true, 'Publicar producto es sensible');
      } else if (moduleKey === 'runly.lms') {
        assert.equal(isSensitive(adapter, definition, { data: {} }), definition.key === 'lms.section.delete', `${definition.key}`);
        if (definition.key === 'lms.course.status') {
          for (const status of ['published', 'archived']) assert.equal(isSensitive(adapter, definition, { status }), true, `${status} es sensible`);
          assert.equal(isSensitive(adapter, definition, { status: 'draft' }), false);
        }
      } else assert.equal(isSensitive(adapter, definition, { data: {} }), expected, `${moduleKey} ${definition.key}`);
    }
  }
  assert.equal(isSensitive({}, {}, {}), false);
});

test('fingerprint: jsonb no cambia propuestas por el orden de claves', () => {
  assert.equal(fingerprint({ input: { a: 1, b: 2 }, preview: [] }), fingerprint({ preview: [], input: { b: 2, a: 1 } }));
  assert.notEqual(fingerprint({ version: 1 }), fingerprint({ version: 2 }));
});

test('Chat: solo metadatos de conversaciones propias de la empresa autorizada', async () => {
  const companyId = '01900000-0000-7000-8000-000000000001', actorId = '01900000-0000-7000-8000-000000000002';
  const queries = [];
  const prisma = { $queryRaw: async (strings, ...values) => {
    const sql = strings.join('?');
    queries.push({ sql, values });
    if (sql.includes('FROM user_profile')) return [{ id: actorId }];
    assert.match(sql, /INNER JOIN chat_conversation_members/);
    assert.match(sql, /public\.runly_chat_user_access/);
    assert.match(sql, /AND \(NOT/);
    assert.ok(values.includes(true));
    assert.ok(values.includes(companyId));
    assert.ok(values.includes(actorId));
    return [{ id: actorId, company_id: companyId, title: 'Mi conversación', type: 'direct', members: [], last_message: { body: 'not-exported-message' }, metadata: { private: 'not-exported-metadata' } }, { id: companyId, company_id: 'other-company', title: 'not-exported-foreign' }];
  } };
  const adapter = createChatAdapter({ prisma });
  const result = await adapter.queries[0].run({ limit: 20 }, { companyId, actorProfileId: actorId, actorAuthUserId: actorId });
  assert.equal(result.conversations.length, 1);
  assert.equal(result.conversations[0].title, 'Mi conversación');
  assert.equal(JSON.stringify(result).includes('not-exported'), false);
  assert.ok(queries.length >= 2);
  assert.equal(adapter.actions.length, 0);
});
