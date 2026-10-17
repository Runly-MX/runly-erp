import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTACHMENT_TARGETS, attachmentTargetSchema } from '../attachment-targets.js';
import { createCapabilityRegistry } from '../registry.js';
import { PERMISSION_CATALOG } from '../../permission-catalog.js';

test('adjuntos: destinos explícitos cubren todos los módulos MCP y solo permisos ERP existentes', () => {
  const registry = createCapabilityRegistry({ prisma: {} });
  const modules = new Set(ATTACHMENT_TARGETS.map(target => target.moduleKey));
  for (const key of ['runly.inventory', ...registry.moduleKeys]) assert.ok(modules.has(key), key);
  assert.equal(new Set(ATTACHMENT_TARGETS.map(target => target.type)).size, ATTACHMENT_TARGETS.length);
  for (const target of ATTACHMENT_TARGETS) {
    assert.ok(PERMISSION_CATALOG[target.readPermission], target.readPermission);
    if (target.writePermission) assert.ok(PERMISSION_CATALOG[target.writePermission], target.writePermission);
    assert.equal(target.mode === 'native', Boolean(target.entityType));
  }
  const id = '01900000-0000-7000-8000-000000000001';
  for (const target of [{ type: 'custom.anyTable', id }, { type: 'hr.employee', id, companyId: id }, { type: 'inventory.item', id, sql: 'DELETE' }]) assert.equal(attachmentTargetSchema.safeParse(target).success, false);
  const prepare = registry.tools.find(tool => tool.name === 'runly_files_import_prepare');
  assert.equal(prepare.inputSchema.safeParse({ companyId: id, itemId: id, target: { type: 'inventory.item', id }, files: [{ file_id: 'f', download_url: 'https://files.example.test/a' }] }).success, false);
});
