import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatTranscriptQueries } from '../adapters/chat-transcripts.js';

const companyId = '01900000-0000-7000-8000-000000000001', me = '01900000-0000-7000-8000-000000000002', tid = '01900000-0000-7000-8000-000000000003';
const segments = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, startMs: i * 60000, endMs: i * 60000 + 5000, text: i === 3 ? 'Se aprobó el presupuesto de áreas' : `Línea ${i} ${'x'.repeat(300)}`, speakerLabel: i % 2 ? 'Ana' : null }));
const row = (over = {}) => ({ id: tid, companyId, conversationId: 'c1', callId: 'k1', status: 'READY', requestedByUserId: me, language: 'es', durationMs: 400000, segments, ...over });
const build = (transcript, { member = true } = {}) => {
  const prisma = {
    callTranscript: { findUnique: async () => transcript },
    $queryRaw: async (strings) => (member && !strings.join('?').includes('call_participant') ? [{ id: 1 }] : []),
    callTranscriptDocument: { findMany: async () => [{ kind: 'RESUMEN', status: 'READY', content: { overview: 'ok' }, updatedAt: new Date(), notes: { big: true } }] },
  };
  const queries = Object.fromEntries(createChatTranscriptQueries({ prisma }).map(q => [q.name, q]));
  return queries;
};
const actor = { companyId, actorProfileId: me };

test('chat transcripts: read paginates by chars and exposes a continuation', async () => {
  const q = build(row());
  const input = q.chat_transcript_read.inputSchema.parse({ transcriptId: tid, maxChars: 1000 });
  const first = await q.chat_transcript_read.run(input, actor);
  assert.equal(first.hasMore, true);
  assert.ok(first.text.length <= 1000 + 400);
  const next = await q.chat_transcript_read.run({ ...input, fromMs: first.nextFromMs }, actor);
  assert.ok(next.text.startsWith(`[${String(Math.floor(first.nextFromMs / 60000)).padStart(2, '0')}:00]`));
});

test('chat transcripts: search ignores case and accents', async () => {
  const q = build(row());
  const result = await q.chat_transcript_search.run({ transcriptId: tid, query: 'AREAS', limit: 5 }, actor);
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].at, '03:00');
});

test('chat transcripts: other company, non-member and non-participant are all 404', async () => {
  for (const [transcript, opts] of [[row({ companyId: 'other' }), {}], [row(), { member: false }], [row({ requestedByUserId: 'someone-else' }), {}]]) {
    const q = build(transcript, opts);
    await assert.rejects(q.chat_transcript_read.run({ transcriptId: tid, fromMs: 0, maxChars: 1000 }, actor), (e) => e.status === 404 || e.code === 'not_found' || /no disponible|no encontrada/i.test(e.message));
  }
});

test('chat transcripts: documents never leak the cached notes', async () => {
  const q = build(row());
  const result = await q.chat_transcript_documents.run({ transcriptId: tid }, actor);
  assert.deepEqual(result.documents.map(d => d.kind), ['RESUMEN']);
  assert.equal(JSON.stringify(result).includes('big'), false);
});
