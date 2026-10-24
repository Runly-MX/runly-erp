import test from "node:test";
import assert from "node:assert/strict";
import {
  chunkSegments, createTokenPacer, parseClock, formatMs, mapChunk, collectSections, buildDigest,
  createPipelineRunner, reduceDocument,
} from "../transcript-map-reduce.js";
import { createCallTranscriptDocumentService } from "../call-transcript-document-service.js";

const seg = (i, text = "x".repeat(200)) => ({ startMs: i * 10_000, endMs: i * 10_000 + 9_000, text, speakerLabel: i % 2 ? "Ana" : "Luis" });

test("chunkSegments never exceeds maxChars of own content and keeps timestamps ordered", () => {
  const segments = Array.from({ length: 60 }, (_, i) => seg(i));
  const chunks = chunkSegments(segments, { maxChars: 1500, overlap: 2 });
  assert.ok(chunks.length > 5);
  for (const c of chunks) assert.ok(c.text.length <= 1500 + 400, `chunk too big: ${c.text.length}`);
  for (let i = 1; i < chunks.length; i += 1) assert.ok(chunks[i].startMs > chunks[i - 1].startMs);
  assert.equal(chunks.at(-1).endMs, segments.at(-1).endMs);
});

test("chunkSegments splits a single oversized segment", () => {
  const chunks = chunkSegments([seg(0, "y".repeat(4000))], { maxChars: 1000, overlap: 0 });
  assert.ok(chunks.length >= 4);
});

test("parseClock handles mm:ss, h:mm:ss and garbage", () => {
  assert.equal(parseClock("74:57"), (74 * 60 + 57) * 1000);
  assert.equal(parseClock("1:14:57"), (74 * 60 + 57) * 1000);
  assert.equal(parseClock("abc"), null);
  assert.equal(formatMs(4_497_000), "74:57");
});

test("token pacer waits when the per-minute budget is exhausted", async () => {
  let t = 0;
  const slept = [];
  const pacer = createTokenPacer({ budgetPerMinute: 1000, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
  await pacer.acquire(600);
  await pacer.acquire(600);
  assert.equal(slept.length, 1);
  assert.ok(t >= 60_000);
});

function fakeRouter(handler) {
  const calls = [];
  return {
    calls,
    async runTask({ messages }) {
      calls.push(messages);
      const obj = handler(messages[0].content, messages[1].content, calls.length);
      return { message: { content: JSON.stringify(obj) }, model: "fake", usage: { total_tokens: 100 } };
    },
  };
}
const noPace = { acquire: async () => ({}), settle() {} };

test("mapChunk sanitizes notes and clamps times into the chunk", async () => {
  const router = fakeRouter(() => ({
    sections: [{ title: "Voceo", from: "99:00", gist: "g", body: "b", bullets: ["a", "", 3] }, { title: "", body: "x" }],
    decisions: [{ text: "Hacer algo", at: "00:20" }],
    actions: [{ text: "Enviar", owner: "Sistemas" }],
  }));
  const { notes } = await mapChunk(createPipelineRunner({ aiRouter: router, pacer: noPace }), { index: 0, startMs: 0, endMs: 60_000, text: "t" });
  assert.equal(notes.sections.length, 1);
  assert.equal(notes.sections[0].startMs, 60_000);
  assert.deepEqual(notes.sections[0].bullets, ["a"]);
  assert.equal(notes.decisions[0].startMs, 20_000);
  assert.equal(notes.actions[0].due, "");
});

test("collectSections merges adjacent duplicates from the overlap", () => {
  const mk = (title, startMs) => ({ endMs: startMs + 1000, sections: [{ title, startMs, gist: "", body: title, bullets: [] }] });
  const out = collectSections([mk("Voceo", 0), mk("voceo", 5000), mk("FIDS", 9000)]);
  assert.deepEqual(out.map((s) => s.title), ["Voceo", "FIDS"]);
});

test("buildDigest condenses recursively until it fits", async () => {
  const notes = Array.from({ length: 30 }, (_, i) => ({
    sections: [{ title: `T${i}`, startMs: i * 1000, gist: "g".repeat(80), body: "" }], decisions: [], actions: [], risks: [], pending: [],
  }));
  const router = fakeRouter((_s, user) => ({ lines: user.split("\n").slice(0, 3) }));
  const digest = await buildDigest(createPipelineRunner({ aiRouter: router, pacer: noPace }), notes, { maxChars: 1000 });
  assert.ok(digest.length <= 1000);
});

test("reduceDocument normalizes MINUTA commitments", async () => {
  const router = fakeRouter(() => ({ objective: "o", executiveSummary: "s", commitments: [{ text: "Hacer" }], risks: [], openDecisions: ["a"], conclusions: "c" }));
  const { content } = await reduceDocument(createPipelineRunner({ aiRouter: router, pacer: noPace }), "MINUTA", "digest");
  assert.deepEqual(content.commitments, [{ text: "Hacer", owner: "Por definir", due: "Por definir" }]);
});

test("document service: maps chunks, reduces, and reuses cached notes for the other kind", async () => {
  const rows = [];
  const prisma = {
    callTranscript: { findUnique: async () => ({
      id: "t1", status: "READY", companyId: "c1", language: "es", durationMs: 600_000, call: { startedAt: new Date() },
      segments: Array.from({ length: 80 }, (_, i) => seg(i)),
    }) },
    callTranscriptDocument: {
      findMany: async () => rows,
      findUnique: async ({ where }) => rows.find((r) => r.kind === where.transcriptId_kind.kind) ?? null,
      create: async ({ data }) => { const r = { id: `d${rows.length}`, updatedAt: new Date(), ...data }; rows.push(r); return r; },
      update: async ({ where, data }) => { const r = rows.find((x) => x.id === where.id); Object.assign(r, data, { updatedAt: new Date() }); return r; },
    },
  };
  const router = fakeRouter((system) => {
    if (system.includes("toma notas")) return { sections: [{ title: "Tema", from: "00:00", gist: "g", body: "b" }] };
    return { objective: "o", executiveSummary: "s", commitments: [], risks: [], openDecisions: [], conclusions: "c", overview: "ov", findings: [{ title: "f", detail: "d" }], priorities: ["p"] };
  });
  const svc = createCallTranscriptDocumentService({
    prisma, env: { GROQ_API_KEY: "k", TRANSCRIPT_AI_TPM: "100000" },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      const out = router.runTask({ messages: body.messages });
      const { message } = await out;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message }], usage: { total_tokens: 50 }, model: "fake" }) };
    },
  });
  await svc.startDocument({ transcriptId: "t1", kind: "MINUTA", profileId: "u1" });
  for (let i = 0; i < 50 && rows[0].status === "PROCESSING"; i += 1) await new Promise((r) => setTimeout(r, 20));
  assert.equal(rows[0].status, "READY");
  assert.ok(rows[0].content.sections.length >= 1);
  const mapCalls = router.calls.length;

  await svc.startDocument({ transcriptId: "t1", kind: "RESUMEN", profileId: "u1" });
  for (let i = 0; i < 50 && rows[1].status === "PROCESSING"; i += 1) await new Promise((r) => setTimeout(r, 20));
  assert.equal(rows[1].status, "READY");
  assert.equal(rows[1].content.findings[0].title, "f");
  assert.equal(router.calls.length, mapCalls + 1, "RESUMEN must only run the reduce call");
});
