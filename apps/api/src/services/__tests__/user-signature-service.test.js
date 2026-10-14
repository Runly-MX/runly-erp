// Saved user signature PNG validation (spec 2026-10-13-inventory-custody-design §9.6).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeUserSignaturePng } from '../user-signature-service.js';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('user signature PNG', () => {
  it('accepts PNG base64 and data URLs', () => {
    assert.ok(decodeUserSignaturePng(PNG_B64).length > 8);
    assert.ok(decodeUserSignaturePng(`data:image/png;base64,${PNG_B64}`).length > 8);
  });

  it('rejects non-PNG, empty and oversized payloads with 400', () => {
    const isBadRequest = (err) => err.name === 'UserSignatureError' && err.status === 400;
    assert.throws(() => decodeUserSignaturePng(Buffer.from('GIF89a-not-a-png').toString('base64')), isBadRequest);
    assert.throws(() => decodeUserSignaturePng(''), isBadRequest);
    const big = Buffer.concat([Buffer.from(PNG_B64, 'base64'), Buffer.alloc(301 * 1024)]).toString('base64');
    assert.throws(() => decodeUserSignaturePng(big), (err) => isBadRequest(err) && /300 KB/.test(err.message));
  });
});
