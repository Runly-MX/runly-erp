import assert from 'node:assert/strict';
import { createMcpCapabilities } from '../capabilities.js';
import { createMcpState, digest } from '../state.js';

export async function fileImportTests(t, { prisma, config, auth, company, other, user, role, request, webToken }) {
  const permission = await prisma.permission.upsert({ where: { key: 'files.assets.create' }, create: { key: 'files.assets.create', name: 'Crear archivos' }, update: {} });
  await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  const item = await prisma.invItem.create({ data: { companyId: company.id, name: 'Activo con tres fotografías' } });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const files = [1, 2, 3].map(index => ({ file_id: `file-original-${index}`, file_name: `Foto ${index}.png`, mime_type: 'image/png', download_url: `https://files.example.test/${index}?signature=ephemeral` }));
  let fetches = 0, failAt = null, changed = false;
  const objects = new Map(), removed = [];
  const supabaseAdmin = { storage: { from(bucket) { return { async upload(key, data, options) {
    assert.equal(bucket, 'runly-files');
    assert.equal(options.upsert, false);
    if (failAt !== null && objects.size === failAt) return { error: new Error('synthetic upload failure') };
    objects.set(key, Buffer.from(data)); return { data: { path: key }, error: null };
  }, async remove(keys) { for (const key of keys) { objects.delete(key); removed.push(key); } return { error: null }; } }; } } };
  const capabilities = createMcpCapabilities({ prisma, config, supabaseAdmin, downloadFile: async (_url, options) => { fetches++; assert.equal(options.httpsOnly, true); return { buffer: changed ? Buffer.concat([png, Buffer.from('changed')]) : png }; } });
  const prepare = (input = {}, actor = auth) => capabilities.run('runly_files_import_prepare', { companyId: company.id, files, ...input }, actor);
  const commit = (proposal, input = {}, actor = auth) => capabilities.run('runly_files_import_commit', { companyId: company.id, proposalId: proposal.proposalId, files, ...input }, actor);
  const approve = async (proposal, value = true) => { const response = await request(`/mcp/proposals/${proposal.proposalId}`, { approve: value }, webToken()); assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); };

  await t.test('Archivos: tres originales aprobados, vinculados al activo existente e idempotentes', async () => {
    const proposal = await prepare({ itemId: item.id });
    assert.equal((await prepare({ itemId: item.id })).proposalId, proposal.proposalId);
    assert.equal(objects.size, 0);
    assert.equal(JSON.stringify((await createMcpState(prisma).get('proposal', proposal.proposalId)).payload).includes('ephemeral'), false);
    await assert.rejects(() => commit(proposal), { code: 'approval_required' });
    assert.equal(objects.size, 0);
    await approve(proposal);
    changed = true;
    await assert.rejects(() => commit(proposal), { code: 'file_changed' });
    changed = false;
    const [result, concurrent] = await Promise.all([commit(proposal), commit(proposal)]);
    assert.deepEqual(concurrent, result);
    assert.equal(result.result.itemId, item.id);
    assert.equal(result.result.files.length, 3);
    assert.equal(objects.size, 3);
    for (const buffer of objects.values()) assert.deepEqual(buffer, png);
    const links = await prisma.invItemFile.findMany({ where: { itemId: item.id }, include: { fileAsset: true } });
    assert.equal(links.length, 3);
    for (const link of links) {
      assert.equal(link.fileAsset.entityId, company.id);
      assert.equal(link.fileAsset.metadata.sourceEntityId, item.id);
      assert.equal(link.fileAsset.metadata.sha256, digest(png));
      assert.equal(link.fileAsset.visibility, 'PRIVATE');
    }
    const before = fetches;
    assert.deepEqual(await commit(proposal, { files: files.map(file => ({ ...file, download_url: 'https://expired.example.test/original' })) }), result);
    assert.equal(fetches, before);
    assert.equal(await prisma.auditLog.count({ where: { action: 'mcp.files.import', metadata: { path: ['proposalHash'], equals: digest(proposal.proposalId) } } }), 1);
    const p = await prisma.permission.findUnique({ where: { key: 'inventory.item.update' } });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } } });
    await assert.rejects(() => commit(proposal), { code: 'permission_denied' });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
  });
  await t.test('Archivos: empresa, scopes, permiso, recurso ajeno, rechazo y caducidad', async () => {
    const before = fetches;
    await assert.rejects(() => prepare({ companyId: other.id }), { code: 'company_not_granted' });
    await assert.rejects(() => prepare({}, { ...auth, scopes: ['runly:read'] }), { code: 'insufficient_scope' });
    await assert.rejects(() => prepare({ itemId: item.id }, { ...auth, scopes: ['files:write'] }), { code: 'insufficient_scope' });
    const hidden = await prisma.invItem.create({ data: { companyId: other.id, name: 'Activo ajeno' } });
    await assert.rejects(() => prepare({ itemId: hidden.id }), { code: 'not_found' });
    await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } } });
    await assert.rejects(() => prepare(), { code: 'permission_denied' });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    assert.equal(fetches, before);
    const rejected = await prepare();
    await approve(rejected, false);
    await assert.rejects(() => commit(rejected), { code: 'approval_required' });
    await prisma.mcpState.update({ where: { key: digest(rejected.proposalId) }, data: { expiresAt: new Date(0) } });
    await assert.rejects(() => commit(rejected), { code: 'not_found' });
  });
  await t.test('Archivos: rollback del lote compensa objetos nuevos; carga privada sin crear otro activo', async () => {
    const proposal = await prepare();
    await approve(proposal);
    const count = await prisma.fileAsset.count();
    failAt = objects.size + 1;
    await assert.rejects(() => commit(proposal), { status: 500 });
    assert.equal(await prisma.fileAsset.count(), count);
    assert.equal(objects.size, 3);
    assert.equal(removed.length, 1);
    failAt = null;
    const result = await commit(proposal);
    assert.equal(result.result.itemId, null);
    assert.equal(objects.size, 6);
    const asset = await prisma.fileAsset.findUnique({ where: { id: result.result.files[0].id } });
    assert.equal(asset.accessScope, 'RESTRICTED');
    assert.equal(asset.uploadedById, user.id);
    assert.equal(await prisma.invItemFile.count({ where: { itemId: item.id } }), 3);
  });
  await t.test('Archivos: cambios del activo y revocación invalidan propuestas pendientes', async () => {
    const proposal = await prepare({ itemId: item.id });
    // A completed proposal remains reusable; changing the target creates a new one.
    await prisma.invItem.update({ where: { id: item.id }, data: { name: 'Nombre modificado' } });
    const pending = await prepare({ itemId: item.id });
    await approve(pending);
    await prisma.invItem.update({ where: { id: item.id }, data: { name: 'Otro cambio' } });
    await assert.rejects(() => commit(pending), { code: 'proposal_stale' });
    assert.notEqual(pending.proposalId, proposal.proposalId);
  });
  // Keep the legacy Inventory count assertions independent of this fixture.
  await prisma.invItem.delete({ where: { id: item.id } });
}
