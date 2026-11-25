import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY, effectivePolicy, normalizeText, policySchema, processingAllowed, supportedFile, withinSchedule } from './policy.js';

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
test('schedules honor time zones and overnight days without widening infrastructure windows',()=>{
  const schedule={timeZone:'America/Mexico_City',windows:[{days:[1],start:'22:00',end:'06:00'}]};
  assert.equal(withinSchedule(schedule,new Date('2026-11-24T05:00:00Z')),true);
  assert.equal(withinSchedule(schedule,new Date('2026-11-24T11:00:00Z')),true);
  assert.equal(withinSchedule(schedule,new Date('2026-11-24T12:00:00Z')),false);
  assert.equal(withinSchedule(schedule,new Date('2026-11-25T05:00:00Z')),false);
  assert.equal(policySchema.safeParse({schedule:{timeZone:'invalid',windows:[]}}).success,false);
});
test('file switches, language/type intersection and budgets are enforced independently of quality',()=>{
  const p=effectivePolicy({profile:'SMART',imageOcr:false,memoryMiB:512,threads:1,dailyProcessingSeconds:60,allowedMimeTypes:['application/pdf']},
    {profile:'DEDICATED',quality:'accurate',memoryMiB:4096,threads:4,dailyProcessingSeconds:86400,allowedMimeTypes:['image/png']});
  assert.equal(p.quality,'accurate');assert.equal(p.memoryMiB,512);assert.equal(p.threads,1);assert.equal(p.dailyProcessingSeconds,60);
  assert.equal(processingAllowed(p,{mimeType:'image/png'}),false);
  assert.equal(processingAllowed(p,{mimeType:'application/pdf'}),false);
  const light=effectivePolicy({profile:'SMART'},{profile:'LIGHT'});
  assert.equal(processingAllowed(light,{mimeType:'image/png'}),false);
  assert.equal(processingAllowed(light,{mimeType:'image/png'},true),true);
  assert.equal(processingAllowed({...light,digitalExtraction:false},{mimeType:'text/plain'}),false);
});
