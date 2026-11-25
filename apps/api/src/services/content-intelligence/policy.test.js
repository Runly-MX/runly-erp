import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY, effectivePolicy, normalizeText, policySchema, supportedFile } from './policy.js';

test('OFF requires explicit activation at both scopes', () => {
  assert.equal(effectivePolicy({}, { profile: 'SMART' }).profile, 'OFF');
  assert.equal(effectivePolicy({ profile: 'SMART' }, {}).profile, 'OFF');
  assert.equal(DEFAULT_POLICY.historical, false);
});
test('company cannot widen instance limits, languages or capabilities', () => {
  const result = effectivePolicy({ profile: 'LIGHT', concurrency: 1, maxPages: 5, historical: false, manualOcr: false, languages: ['spa'], searchEnabled: false },
    { profile: 'DEDICATED', concurrency: 4, maxPages: 200, historical: true, manualOcr: true, languages: ['spa','eng'] });
  assert.equal(result.profile, 'LIGHT');
  assert.equal(result.concurrency, 1);
  assert.equal(result.maxPages, 5);
  assert.equal(result.historical, false);
  assert.equal(result.manualOcr, false);
  assert.equal(result.automaticOcr, false);
  assert.equal(result.searchEnabled, false);
  assert.deepEqual(result.languages, ['spa']);
});
test('normalization preserves ambiguous serial characters independently from original', () => {
  assert.equal(normalizeText('Número S/N: O0-I1-S5-B8-Z2'), 'numero s n o0 i1 s5 b8 z2');
});
test('untrusted policy fields and resource extremes are rejected', () => {
  for (const input of [{ concurrency: 99 }, { timeoutSeconds: -1 }, { languages: ['eng;curl'] }, { cpuLimit: 99 }, { maxPixels: Infinity }]) {
    assert.equal(policySchema.safeParse(input).success, false);
  }
});
test('supported file metadata does not claim arbitrary archives or executables', () => {
  assert.equal(supportedFile({ mimeType: 'application/zip' }), false);
  assert.equal(supportedFile({ mimeType: 'application/pdf' }), true);
  assert.equal(supportedFile({ mimeType: 'image/png' }), true);
});
