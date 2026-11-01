import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createCallsRouter } from "../index.js";

const COMPANY = "55555555-5555-4555-8555-555555555555";
const PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const TRANSCRIPT = "77777777-7777-4777-8777-777777777777";
const SEGMENT = "88888888-8888-4888-8888-888888888888";
const TERM = "99999999-9999-4999-8999-999999999999";

const requirePermission = () => async (c, next) => {
  c.set("userId", PROFILE_ID);
  await next();
};

function createApp({ companyId = COMPANY, transcriptService = {} } = {}) {
  const state = { settings: null, terms: [] };
  const prisma = {
    callTranscriptionSettings: {
      findUnique: async () => state.settings,
      upsert: async ({ create, update }) => { state.settings = { ...(state.settings ?? create), ...update }; return state.settings; },
    },
    callTranscriptionTerm: {
      findMany: async () => state.terms,
      count: async () => state.terms.length,
      upsert: async ({ create }) => { const row = { id: TERM, hits: 1, ...create }; state.terms.push(row); return row; },
      deleteMany: async ({ where }) => {
        const before = state.terms.length;
        state.terms = state.terms.filter((t) => t.id !== where.id);
        return { count: before - state.terms.length };
      },
    },
  };
  const app = createCallsRouter({
    prisma,
    service: {},
    recordingService: {},
    transcriptService,
    authMiddleware: async (c, next) => {
      c.set("authUserId", "auth-user");
      if (companyId) c.set("companyId", companyId);
      await next();
    },
    requirePermission,
  });
  return { app, state };
}

const json = (method, body) => ({
  method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
});

describe("transcription settings routes", () => {
  let previousKey;
  beforeEach(() => { previousKey = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = "test-key"; });
  afterEach(() => {
    if (previousKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previousKey;
  });

  it("returns the engine and the glossary", async () => {
    const { app, state } = createApp();
    state.terms.push({ id: TERM, term: "BACnet", heardAs: "", source: "MANUAL", hits: 1 });
    const response = await app.request("/calls/transcription/settings");
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.engine, "LOCAL");
    assert.equal(data.externalAvailable, true);
    assert.equal(data.terms[0].term, "BACnet");
  });

  it("needs an explicit acknowledgement before sending audio to the external engine", async () => {
    const { app, state } = createApp();
    const refused = await app.request("/calls/transcription/settings", json("PUT", { engine: "GROQ" }));
    assert.equal(refused.status, 422);
    assert.equal(state.settings, null);

    const accepted = await app.request("/calls/transcription/settings", json("PUT", { engine: "GROQ", acknowledgeExternal: true }));
    assert.equal(accepted.status, 200);
    assert.equal(state.settings.engine, "GROQ");
    assert.equal(state.settings.externalConsentBy, PROFILE_ID);
  });

  it("adds and removes glossary terms, and rejects an empty one", async () => {
    const { app, state } = createApp();
    const created = await app.request("/calls/transcription/terms", json("POST", { term: " Schindler ", heardAs: "Schittler" }));
    assert.equal(created.status, 201);
    assert.equal(state.terms[0].term, "Schindler");
    assert.equal(state.terms[0].heardAs, "Schittler");

    const invalid = await app.request("/calls/transcription/terms", json("POST", { term: "   " }));
    assert.equal(invalid.status, 422);

    assert.equal((await app.request(`/calls/transcription/terms/${TERM}`, { method: "DELETE" })).status, 200);
    assert.equal((await app.request(`/calls/transcription/terms/${TERM}`, { method: "DELETE" })).status, 404);
  });

  it("needs a selected company", async () => {
    const { app } = createApp({ companyId: null });
    assert.equal((await app.request("/calls/transcription/settings")).status, 400);
  });
});

describe("transcript segment edit route", () => {
  it("forwards the edit with the caller's profile and supports revert", async () => {
    const calls = [];
    const { app } = createApp({
      transcriptService: { updateSegmentText: async (args) => { calls.push(args); return { id: SEGMENT, text: "ok", originalText: null }; } },
    });
    const url = `/calls/transcripts/${TRANSCRIPT}/segments/${SEGMENT}`;
    assert.equal((await app.request(url, json("PATCH", { text: "usamos BACnet" }))).status, 200);
    assert.equal((await app.request(url, json("PATCH", { revert: true }))).status, 200);
    assert.deepEqual(calls, [
      { transcriptId: TRANSCRIPT, segmentId: SEGMENT, text: "usamos BACnet", revert: false, profileId: PROFILE_ID },
      { transcriptId: TRANSCRIPT, segmentId: SEGMENT, text: undefined, revert: true, profileId: PROFILE_ID },
    ]);
  });

  it("rejects an invalid segment id", async () => {
    const { app } = createApp({ transcriptService: { updateSegmentText: async () => ({}) } });
    const response = await app.request(`/calls/transcripts/${TRANSCRIPT}/segments/not-a-uuid`, json("PATCH", { text: "x" }));
    assert.equal(response.status, 422);
  });
});
