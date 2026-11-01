// Transcription engine choice, company glossary and the Whisper hint that goes
// with each transcript. Everything here is resolved by the API when a
// transcript is requested and stored on the row, because runly-transcriber only
// talks to the database (see apps/transcriber/main.py).
import { cleanTerm, applyPairsToSegments, diffReplacement } from "./call-transcript-corrections.js";

const LOG_PREFIX = "[runly.calls/transcript-vocabulary]";

// Whisper keeps roughly the last 224 tokens of a prompt; the worker adds its
// own prefix/suffix, so the per-meeting hint stays well under that.
const MAX_PROMPT_CHARS = 560;
const MAX_PROMPT_TERMS = 24;
const MAX_PROMPT_NAMES = 8;
const MAX_TERMS_PER_COMPANY = 500;
const VALID_ENGINES = ["LOCAL", "GROQ"];

// A replacement rule found by a person is trusted right away; one learned from
// edits needs to repeat, and one proposed by the AI needs to repeat more.
const RULE_MIN_HITS = { MANUAL: 1, LEARNED: 2, AI: 3 };

export class TranscriptVocabularyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "TranscriptVocabularyError";
    this.status = status;
  }
}

export function isRuleActive(term) {
  return Boolean(term.heardAs) && term.hits >= (RULE_MIN_HITS[term.source] ?? Infinity);
}

// Natural sentence on purpose: Whisper repeats label words ("Participantes:",
// "Términos:") from a prompt into the transcript.
export function composePrompt({ names = [], title = "", terms = [] }) {
  const cleanNames = [...new Set(names.map(cleanTerm).filter(Boolean))].slice(0, MAX_PROMPT_NAMES);
  const cleanTitle = cleanTerm(title).slice(0, 80);
  const cleanTerms = [...new Set(terms.map(cleanTerm).filter(Boolean))].slice(0, MAX_PROMPT_TERMS);
  if (!cleanNames.length && !cleanTitle && !cleanTerms.length) return null;

  const who = cleanNames.length > 1
    ? `${cleanNames.slice(0, -1).join(", ")} y ${cleanNames.at(-1)}`
    : cleanNames[0] ?? "";
  const topic = cleanTitle ? `${cleanTitle}` : "";
  const build = (termList) => {
    const subject = who ? `${who} hablan` : "Se habla";
    const about = [topic, termList.join(", ")].filter(Boolean).join(": ");
    return about ? `${subject} de ${about}.` : `${subject}.`;
  };

  // Drop the least relevant terms (the list is ordered by relevance) until it fits.
  let list = cleanTerms;
  let prompt = build(list);
  while (prompt.length > MAX_PROMPT_CHARS && list.length) {
    list = list.slice(0, -1);
    prompt = build(list);
  }
  return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) : prompt;
}

export function createTranscriptVocabularyService({ prisma, env = process.env }) {
  const externalAvailable = () => Boolean(env.GROQ_API_KEY);

  async function getSettings(companyId) {
    const row = await prisma.callTranscriptionSettings.findUnique({ where: { companyId } });
    return {
      engine: row?.engine ?? "LOCAL",
      externalAvailable: externalAvailable(),
      externalConsentAt: row?.externalConsentAt ?? null,
    };
  }

  // GROQ sends meeting audio to an external service, so turning it on needs an
  // explicit acknowledgement that is recorded with who gave it and when.
  async function updateSettings({ companyId, profileId, engine, acknowledgeExternal = false }) {
    if (!VALID_ENGINES.includes(engine)) throw new TranscriptVocabularyError("Motor de transcripción no válido.", 400);
    const current = await prisma.callTranscriptionSettings.findUnique({ where: { companyId } });
    let consent = {};
    if (engine === "GROQ") {
      if (!externalAvailable()) {
        throw new TranscriptVocabularyError("El motor externo no está configurado en esta instancia.", 422);
      }
      if (!current?.externalConsentAt) {
        if (acknowledgeExternal !== true) {
          throw new TranscriptVocabularyError(
            "Debes confirmar que el audio de las reuniones se enviará a un servicio externo.",
            422,
          );
        }
        consent = { externalConsentAt: new Date(), externalConsentBy: profileId };
      }
    }
    await prisma.callTranscriptionSettings.upsert({
      where: { companyId },
      create: { companyId, engine, ...consent },
      update: { engine, ...consent },
    });
    return getSettings(companyId);
  }

  async function resolveEngine(companyId) {
    const settings = await getSettings(companyId);
    return settings.engine === "GROQ" && settings.externalAvailable && settings.externalConsentAt ? "GROQ" : "LOCAL";
  }

  const TERM_ORDER = [{ hits: "desc" }, { updatedAt: "desc" }];

  function listTerms(companyId) {
    return prisma.callTranscriptionTerm.findMany({ where: { companyId }, orderBy: TERM_ORDER });
  }

  async function addTerm({ companyId, term, heardAs = "" }) {
    const cleanedTerm = cleanTerm(term).slice(0, 80);
    const cleanedHeard = cleanTerm(heardAs).slice(0, 80);
    if (!cleanedTerm) throw new TranscriptVocabularyError("Escribe el término.", 400);
    if (cleanedHeard && cleanedHeard.toLowerCase() === cleanedTerm.toLowerCase() && cleanedHeard === cleanedTerm) {
      throw new TranscriptVocabularyError("El término y cómo se transcribe no pueden ser iguales.", 400);
    }
    const count = await prisma.callTranscriptionTerm.count({ where: { companyId } });
    if (count >= MAX_TERMS_PER_COMPANY) {
      throw new TranscriptVocabularyError("Se alcanzó el máximo de términos del glosario.", 422);
    }
    return prisma.callTranscriptionTerm.upsert({
      where: { companyId_term_heardAs: { companyId, term: cleanedTerm, heardAs: cleanedHeard } },
      create: { companyId, term: cleanedTerm, heardAs: cleanedHeard, source: "MANUAL" },
      update: { source: "MANUAL" },
    });
  }

  async function removeTerm({ companyId, termId }) {
    const { count } = await prisma.callTranscriptionTerm.deleteMany({ where: { id: termId, companyId } });
    if (!count) throw new TranscriptVocabularyError("Término no encontrado.", 404);
  }

  // Records a (wrong -> right) pair seen by the AI or a person; the count only
  // grows when the pair really changed something, so re-running an analysis
  // doesn't inflate it.
  async function recordPair({ companyId, wrong, right, source }) {
    const term = cleanTerm(right).slice(0, 80);
    const heardAs = cleanTerm(wrong).slice(0, 80);
    if (!term || !heardAs) return;
    const count = await prisma.callTranscriptionTerm.count({ where: { companyId } });
    const existing = await prisma.callTranscriptionTerm.findUnique({
      where: { companyId_term_heardAs: { companyId, term, heardAs } },
    });
    if (!existing && count >= MAX_TERMS_PER_COMPANY) return;
    await prisma.callTranscriptionTerm.upsert({
      where: { companyId_term_heardAs: { companyId, term, heardAs } },
      create: { companyId, term, heardAs, source },
      update: { hits: { increment: 1 } },
    });
  }

  async function recordAiCorrections({ companyId, applied }) {
    for (const pair of applied) {
      await recordPair({ companyId, wrong: pair.wrong, right: pair.right, source: "AI" })
        .catch((error) => console.warn(`${LOG_PREFIX} No se pudo guardar la corrección:`, error?.message ?? error));
    }
  }

  // A person fixed a segment by hand: remember the replacement so the next
  // transcripts hear it right.
  async function learnFromEdit({ companyId, before, after }) {
    const pair = diffReplacement(before, after);
    if (!pair) return null;
    await recordPair({ companyId, wrong: pair.wrong, right: pair.right, source: "LEARNED" });
    return pair;
  }

  // Terms for the Whisper prompt, most relevant first: what the company has
  // used the most. Every distinct "right" form counts, rules or not.
  async function promptTerms(companyId) {
    const rows = await prisma.callTranscriptionTerm.findMany({
      where: { companyId },
      orderBy: TERM_ORDER,
      take: MAX_PROMPT_TERMS * 3,
    });
    return [...new Set(rows.map((row) => row.term))];
  }

  async function participantNames(call) {
    const [participants, guests] = await Promise.all([
      prisma.callParticipant.findMany({
        where: { callId: call.id },
        select: { user: { select: { displayName: true } } },
      }),
      prisma.callGuest.findMany({ where: { callId: call.id }, select: { displayName: true } }),
    ]);
    return [
      ...participants.map((p) => p.user?.displayName),
      ...guests.map((g) => g.displayName),
    ].filter(Boolean);
  }

  async function eventTitle(call) {
    if (!call.calendarEventId) return "";
    const event = await prisma.calendarEvent.findUnique({ where: { id: call.calendarEventId }, select: { title: true } });
    return event?.title ?? "";
  }

  // Never blocks a transcript: any failure just means no hint / local engine.
  async function resolveRequestContext({ companyId, call }) {
    const settle = async (promise, fallback) => {
      try { return await promise; } catch (error) {
        console.warn(`${LOG_PREFIX} Contexto de transcripción incompleto:`, error?.message ?? error);
        return fallback;
      }
    };
    const [requestedEngine, terms, names, title] = await Promise.all([
      settle(resolveEngine(companyId), "LOCAL"),
      settle(promptTerms(companyId), []),
      settle(participantNames(call), []),
      settle(eventTitle(call), ""),
    ]);
    return { requestedEngine, vocabularyPrompt: composePrompt({ names, title, terms }) };
  }

  // Replacement rules that are trusted (see RULE_MIN_HITS) applied to a freshly
  // finished transcript.
  async function applyRules({ transcriptId, companyId }) {
    const rows = await prisma.callTranscriptionTerm.findMany({
      where: { companyId, NOT: { heardAs: "" } },
      orderBy: TERM_ORDER,
    });
    const pairs = rows.filter(isRuleActive).map((row) => ({ wrong: row.heardAs, right: row.term }));
    if (!pairs.length) return { changedSegments: 0, applied: [] };
    return applyPairsToSegments(prisma, transcriptId, pairs);
  }

  return {
    getSettings, updateSettings, resolveEngine, listTerms, addTerm, removeTerm,
    recordAiCorrections, learnFromEdit, promptTerms, resolveRequestContext, applyRules,
  };
}
