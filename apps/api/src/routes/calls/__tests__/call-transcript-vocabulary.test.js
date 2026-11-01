import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizePairs, diffReplacement, replaceTerm, applyPairsToSegments,
} from "../call-transcript-corrections.js";
import {
  composePrompt, isRuleActive, createTranscriptVocabularyService, TranscriptVocabularyError,
} from "../call-transcript-vocabulary.js";
import { createCallTranscriptService } from "../call-transcript-service.js";

const COMPANY = "55555555-5555-4555-8555-555555555555";
const USER = "33333333-3333-4333-8333-333333333333";
const TRANSCRIPT = "77777777-7777-4777-8777-777777777777";
const SEGMENT = "88888888-8888-4888-8888-888888888888";

describe("corrections", () => {
  it("replaces whole words only and keeps accents/case of the replacement", () => {
    assert.deepEqual(replaceTerm("el protocolo Baglet y Bagletx", "Baglet", "BACnet"), {
      text: "el protocolo BACnet y Bagletx", count: 1,
    });
    assert.equal(replaceTerm("de Schittler a Schittler", "schittler", "Schindler").count, 2);
  });

  it("keeps only pairs whose wrong side literally appears in the transcript", () => {
    const text = "usamos Baglet con barco ofis";
    const pairs = sanitizePairs([
      { wrong: "Baglet", right: "BACnet" },
      { wrong: "barco ofis", right: "back office" },
      { wrong: "inventado", right: "algo" }, // not in the transcript
      { wrong: "ab", right: "x" }, // too short
      { wrong: "Baglet", right: "BACnet2" }, // duplicate wrong
      { wrong: "barco", right: "x".repeat(200) }, // not a short term
    ], text);
    assert.deepEqual(pairs, [
      { wrong: "Baglet", right: "BACnet" },
      { wrong: "barco ofis", right: "back office" },
    ]);
  });

  it("derives a pair only from a small word replacement", () => {
    assert.deepEqual(diffReplacement("usamos el protocolo Baglet aquí", "usamos el protocolo BACnet aquí"), {
      wrong: "Baglet", right: "BACnet",
    });
    assert.deepEqual(diffReplacement("conectar a barco ofis hoy", "conectar a back office hoy"), {
      wrong: "barco ofis", right: "back office",
    });
    assert.equal(diffReplacement("hola mundo", "hola mundo cruel"), null); // insertion
    assert.equal(diffReplacement("uno dos tres cuatro", "uno"), null); // deletion
    assert.equal(diffReplacement("a b c d e f", "x y z w q r"), null); // rewrite
  });

  it("applies pairs to segments and keeps the first-seen text", async () => {
    const updates = [];
    const prisma = {
      callTranscriptSegment: {
        findMany: async () => [
          { id: "s1", text: "el protocolo Baglet", originalText: null },
          { id: "s2", text: "nada que cambiar", originalText: null },
          { id: "s3", text: "otra vez Baglet", originalText: "otra vez Baglet!" },
        ],
        update: async (args) => { updates.push(args); },
      },
    };
    const result = await applyPairsToSegments(prisma, TRANSCRIPT, [{ wrong: "Baglet", right: "BACnet" }]);
    assert.equal(result.changedSegments, 2);
    assert.deepEqual(result.applied, [{ wrong: "Baglet", right: "BACnet", count: 2 }]);
    assert.equal(updates[0].data.originalText, "el protocolo Baglet");
    assert.equal(updates[1].data.originalText, "otra vez Baglet!"); // earlier original is never overwritten
  });
});

describe("composePrompt", () => {
  it("builds a label-free sentence and fits the limit by dropping the least relevant terms", () => {
    const prompt = composePrompt({
      names: ["Juan Pablo", "Omar", "Moisés"],
      title: "Seguimiento aeropuerto",
      terms: ["BACnet", "RJ45", "Schindler"],
    });
    assert.equal(prompt, "Juan Pablo, Omar y Moisés hablan de Seguimiento aeropuerto: BACnet, RJ45, Schindler.");
    assert.doesNotMatch(prompt, /Participantes|Términos/);

    const long = composePrompt({ terms: Array.from({ length: 24 }, (_, i) => `termino-largo-numero-${i}-`.repeat(2)) });
    assert.ok(long.length <= 560);
    assert.match(long, /^Se habla de termino-largo-numero-0/); // most relevant kept
  });

  it("returns null with nothing to say", () => {
    assert.equal(composePrompt({}), null);
  });
});

describe("vocabulary service", () => {
  function fakePrisma(initial = null) {
    const state = { settings: initial };
    return {
      state,
      callTranscriptionSettings: {
        findUnique: async () => state.settings,
        upsert: async ({ create, update }) => { state.settings = { ...(state.settings ?? create), ...update }; return state.settings; },
      },
    };
  }

  it("requires the instance key and a recorded acknowledgement before enabling the external engine", async () => {
    const noKey = createTranscriptVocabularyService({ prisma: fakePrisma(), env: {} });
    await assert.rejects(
      noKey.updateSettings({ companyId: COMPANY, profileId: USER, engine: "GROQ", acknowledgeExternal: true }),
      (e) => e instanceof TranscriptVocabularyError && e.status === 422,
    );

    const prisma = fakePrisma();
    const svc = createTranscriptVocabularyService({ prisma, env: { GROQ_API_KEY: "k" } });
    await assert.rejects(
      svc.updateSettings({ companyId: COMPANY, profileId: USER, engine: "GROQ" }),
      (e) => e instanceof TranscriptVocabularyError && /confirmar/.test(e.message),
    );
    assert.equal(await svc.resolveEngine(COMPANY), "LOCAL");

    const saved = await svc.updateSettings({ companyId: COMPANY, profileId: USER, engine: "GROQ", acknowledgeExternal: true });
    assert.equal(saved.engine, "GROQ");
    assert.ok(prisma.state.settings.externalConsentAt);
    assert.equal(prisma.state.settings.externalConsentBy, USER);
    assert.equal(await svc.resolveEngine(COMPANY), "GROQ");

    // Going back to local keeps the consent; the key disappearing forces local.
    await svc.updateSettings({ companyId: COMPANY, profileId: USER, engine: "LOCAL" });
    assert.equal(await svc.resolveEngine(COMPANY), "LOCAL");
    const keyGone = createTranscriptVocabularyService({ prisma, env: {} });
    await keyGone.updateSettings({ companyId: COMPANY, profileId: USER, engine: "LOCAL" });
    prisma.state.settings.engine = "GROQ";
    assert.equal(await keyGone.resolveEngine(COMPANY), "LOCAL");
  });

  it("trusts a manual rule at once, a learned rule after it repeats, an AI rule after more", () => {
    assert.equal(isRuleActive({ heardAs: "Baglet", source: "MANUAL", hits: 1 }), true);
    assert.equal(isRuleActive({ heardAs: "Baglet", source: "LEARNED", hits: 1 }), false);
    assert.equal(isRuleActive({ heardAs: "Baglet", source: "LEARNED", hits: 2 }), true);
    assert.equal(isRuleActive({ heardAs: "Baglet", source: "AI", hits: 2 }), false);
    assert.equal(isRuleActive({ heardAs: "Baglet", source: "AI", hits: 3 }), true);
    assert.equal(isRuleActive({ heardAs: "", source: "MANUAL", hits: 9 }), false); // hint only
  });
});

describe("createCallTranscriptService.updateSegmentText", () => {
  function build({ segment, learn }) {
    const updates = [];
    const prisma = {
      $queryRaw: async () => [{ id: "member" }],
      callTranscript: { findUnique: async () => ({ id: TRANSCRIPT, conversationId: "c", companyId: COMPANY, status: "READY" }) },
      callTranscriptSegment: {
        findFirst: async () => segment,
        update: async (args) => { updates.push(args); return { id: SEGMENT, ...args.data }; },
      },
    };
    const vocabularyService = { learnFromEdit: async (args) => { learn.push(args); } };
    return { svc: createCallTranscriptService({ prisma, vocabularyService }), updates };
  }

  it("keeps the engine text on the first edit and learns the replacement", async () => {
    const learn = [];
    const { svc, updates } = build({ segment: { id: SEGMENT, text: "el protocolo Baglet", originalText: null }, learn });
    await svc.updateSegmentText({ transcriptId: TRANSCRIPT, segmentId: SEGMENT, text: "el protocolo BACnet", profileId: USER });
    assert.deepEqual(updates[0].data, { text: "el protocolo BACnet", originalText: "el protocolo Baglet" });
    assert.deepEqual(learn, [{ companyId: COMPANY, before: "el protocolo Baglet", after: "el protocolo BACnet" }]);
  });

  it("typing the original back clears it without learning, and revert restores it", async () => {
    const learn = [];
    const { svc, updates } = build({ segment: { id: SEGMENT, text: "el protocolo BACnet", originalText: "el protocolo Baglet" }, learn });
    await svc.updateSegmentText({ transcriptId: TRANSCRIPT, segmentId: SEGMENT, text: "el protocolo Baglet", profileId: USER });
    assert.deepEqual(updates[0].data, { text: "el protocolo Baglet", originalText: null });
    await svc.updateSegmentText({ transcriptId: TRANSCRIPT, segmentId: SEGMENT, revert: true, profileId: USER });
    assert.deepEqual(updates[1].data, { text: "el protocolo Baglet", originalText: null });
    assert.equal(learn.length, 0);
  });

  it("rejects an empty text", async () => {
    const { svc } = build({ segment: { id: SEGMENT, text: "hola", originalText: null }, learn: [] });
    await assert.rejects(
      svc.updateSegmentText({ transcriptId: TRANSCRIPT, segmentId: SEGMENT, text: "   ", profileId: USER }),
      (e) => e.status === 400,
    );
  });
});
