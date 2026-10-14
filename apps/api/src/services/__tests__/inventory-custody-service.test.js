// Pure custody (resguardo) logic: folio, transitions, token, signature,
// snapshot and completion conflicts. No database.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCustodyAction, assertDelivererChoice, buildItemSnapshot, completionConflicts, decodeSignaturePng, formatCustodyFolio,
  generatePublicToken, hashToken, isPlausibleToken, isTokenUsable, normalizeCustodyInput,
  savedSignatureDecision, signatureResetFor,
} from '../inventory-custody-helpers.js';
import { serializeTemplate } from '../inventory-document-template-service.js';
import { NO_TAGS_WARNING } from '../document-templates/custody-template-data.js';
import { serializeCustody } from '../inventory-custody-service.js';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const EMP = '01900000-0000-7000-8000-0000000000e1';
const OTHER = '01900000-0000-7000-8000-0000000000e2';
const ITEM = '01900000-0000-7000-8000-0000000000a1';

describe('custody folio and transitions', () => {
  it('formats folios per kind', () => {
    assert.equal(formatCustodyFolio('DELIVERY', 2026, 7), 'RES-2026-0007');
    assert.equal(formatCustodyFolio('RETURN', 2026, 12345), 'DEV-2026-12345');
  });

  it('guards actions by status', () => {
    assert.doesNotThrow(() => assertCustodyAction({ status: 'DRAFT' }, 'update'));
    assert.doesNotThrow(() => assertCustodyAction({ status: 'PENDING_SIGNATURE' }, 'update'));
    assert.throws(() => assertCustodyAction({ status: 'COMPLETED' }, 'update'), (err) => err.status === 409);
    assert.throws(() => assertCustodyAction({ status: 'COMPLETED' }, 'complete'), (err) => err.status === 409);
    assert.throws(() => assertCustodyAction({ status: 'CANCELLED' }, 'cancel'), (err) => err.status === 409);
    assert.doesNotThrow(() => assertCustodyAction({ status: 'COMPLETED' }, 'cancel'));
  });
});

describe('public token', () => {
  it('stores only the sha256 hash and expires in 24 h', () => {
    const now = Date.UTC(2026, 0, 1);
    const { token, hash, expiresAt } = generatePublicToken(now);
    assert.ok(isPlausibleToken(token));
    assert.equal(hash, hashToken(token));
    assert.equal(hash.length, 64);
    assert.equal(expiresAt.getTime() - now, 24 * 3600 * 1000);
  });

  it('is usable only before expiry and while signable', () => {
    const base = { publicTokenHash: 'x', tokenExpiresAt: new Date('2026-01-02T00:00:00Z'), status: 'PENDING_SIGNATURE' };
    assert.equal(isTokenUsable(base, new Date('2026-01-01T12:00:00Z')), true);
    assert.equal(isTokenUsable(base, new Date('2026-01-02T00:00:01Z')), false);
    assert.equal(isTokenUsable({ ...base, status: 'COMPLETED' }, new Date('2026-01-01T12:00:00Z')), false);
    assert.equal(isPlausibleToken('short'), false);
  });

  it('serialized custody never exposes the token hash', () => {
    const out = serializeCustody({ id: '1', publicTokenHash: 'secret', tokenExpiresAt: new Date(Date.now() + 1000), items: [] });
    assert.equal('publicTokenHash' in out, false);
    assert.equal(out.hasPublicLink, true);
  });
});

describe('signature decoding', () => {
  it('accepts PNG base64 and data URLs, rejects others', () => {
    assert.ok(decodeSignaturePng(PNG_B64).length > 8);
    assert.ok(decodeSignaturePng(`data:image/png;base64,${PNG_B64}`).length > 8);
    assert.throws(() => decodeSignaturePng(Buffer.from('GIF89a-not-a-png').toString('base64')), (err) => err.status === 400);
    assert.throws(() => decodeSignaturePng(''), (err) => err.status === 400);
  });
});

describe('snapshot and input', () => {
  it('builds the item snapshot', () => {
    const snap = buildItemSnapshot({ category: { name: 'Laptop' }, brand: { name: 'Marca' }, catalogModel: { name: 'M1' }, model: 'old', serialNumber: 'SN', assetTag: 'A-1', invoiceNumber: 'F-9', description: '16 GB' });
    assert.deepEqual(snap, { typeBrand: 'Laptop Marca', model: 'M1', serialNumber: 'SN', assetTag: 'A-1', invoiceNumber: 'F-9', features: '16 GB' });
  });

  it('normalizes create input and rejects bad bodies', () => {
    const input = normalizeCustodyInput({ employeeId: EMP, itemIds: [ITEM, ITEM], date: '2026-03-05' });
    assert.equal(input.kind, 'DELIVERY');
    assert.deepEqual(input.itemIds, [ITEM]);
    assert.equal(input.date.toISOString(), '2026-03-05T00:00:00.000Z');
    assert.throws(() => normalizeCustodyInput({ employeeId: EMP, itemIds: [] }), (err) => err.status === 400);
    assert.throws(() => normalizeCustodyInput({ kind: 'LOAN', employeeId: EMP, itemIds: [ITEM] }), (err) => err.status === 400);
    assert.deepEqual(normalizeCustodyInput({ comments: 'x' }, { partial: true }), { comments: 'x' });
  });
});

describe('completion conflicts', () => {
  const item = { id: ITEM, assetTag: 'A-1', enabled: true, adminStatus: 'registered' };

  it('delivery: accepts free items and items already with the same employee', () => {
    assert.deepEqual(completionConflicts({ kind: 'DELIVERY', employeeId: EMP, items: [item], itemIds: [ITEM], activeByItem: new Map() }), []);
    assert.deepEqual(completionConflicts({ kind: 'DELIVERY', employeeId: EMP, items: [item], itemIds: [ITEM], activeByItem: new Map([[ITEM, { employeeId: EMP }]]) }), []);
  });

  it('delivery: rejects items assigned elsewhere or not registered', () => {
    assert.equal(completionConflicts({ kind: 'DELIVERY', employeeId: EMP, items: [item], itemIds: [ITEM], activeByItem: new Map([[ITEM, { employeeId: OTHER }]]) }).length, 1);
    assert.equal(completionConflicts({ kind: 'DELIVERY', employeeId: EMP, items: [{ ...item, adminStatus: 'deregistered' }], itemIds: [ITEM], activeByItem: new Map() }).length, 1);
  });

  it('return: requires the item assigned to that employee', () => {
    assert.deepEqual(completionConflicts({ kind: 'RETURN', employeeId: EMP, items: [item], itemIds: [ITEM], activeByItem: new Map([[ITEM, { employeeId: EMP }]]) }), []);
    assert.equal(completionConflicts({ kind: 'RETURN', employeeId: EMP, items: [item], itemIds: [ITEM], activeByItem: new Map() }).length, 1);
  });
});

describe('revision 2: editing, deliverer and saved signatures', () => {
  const current = { kind: 'DELIVERY', employeeId: EMP, delivererId: 'u1', items: [{ itemId: ITEM }] };

  it('PATCH clears signatures only for kind, employee, items or deliverer', () => {
    assert.deepEqual(signatureResetFor(current, { comments: 'x', date: new Date(), templateId: null }), { receiver: false, deliverer: false });
    assert.deepEqual(signatureResetFor(current, { itemIds: [ITEM] }), { receiver: false, deliverer: false });
    assert.deepEqual(signatureResetFor(current, { itemIds: [ITEM, OTHER] }), { receiver: true, deliverer: true });
    assert.deepEqual(signatureResetFor(current, { employeeId: OTHER }), { receiver: true, deliverer: true });
    assert.deepEqual(signatureResetFor(current, { kind: 'RETURN' }), { receiver: true, deliverer: true });
    assert.deepEqual(signatureResetFor(current, { delivererId: 'u2' }), { receiver: false, deliverer: true });
  });

  it('choosing another deliverer requires deliver_on_behalf', () => {
    assert.doesNotThrow(() => assertDelivererChoice({ actorId: 'u1', delivererId: 'u1', canDeliverOnBehalf: false }));
    assert.throws(() => assertDelivererChoice({ actorId: 'u1', delivererId: 'u2', canDeliverOnBehalf: false }), (err) => err.status === 403);
    assert.doesNotThrow(() => assertDelivererChoice({ actorId: 'u1', delivererId: 'u2', canDeliverOnBehalf: true }));
  });

  it('saved signature: own always, others need permission and delegation', () => {
    const decide = (overrides) => savedSignatureDecision({ actorId: 'u1', ownerId: 'u2', canDeliverOnBehalf: true, allowDelegation: true, ...overrides }).allowed;
    assert.equal(decide({ ownerId: 'u1', canDeliverOnBehalf: false, allowDelegation: false }), true);
    assert.equal(decide({}), true);
    assert.equal(decide({ canDeliverOnBehalf: false }), false);
    assert.equal(decide({ allowDelegation: false }), false);
    assert.equal(decide({ ownerId: null }), false);
  });

  it('templates without tags carry a warning and the tag count', () => {
    const base = { id: 't', kind: 'custody', format: 'docx', name: 'P', fileAssetId: 'f', isDefault: true, enabled: true };
    const empty = serializeTemplate({ ...base, placeholders: [] });
    assert.equal(empty.tagCount, 0);
    assert.deepEqual(empty.warnings, [NO_TAGS_WARNING]);
    const tagged = serializeTemplate({ ...base, placeholders: ['folio', 'receiverName'] });
    assert.equal(tagged.tagCount, 2);
    assert.deepEqual(tagged.warnings, []);
  });
});
