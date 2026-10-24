// Minuta / resumen ejecutivo for long transcripts (map-reduce, see
// transcript-map-reduce.js). The run is detached from the HTTP request: the
// row carries status + progress and the UI polls it. SECURITY: like the
// analysis service, access checks (participant/requester) are the caller's job.
import { createAiRouter } from "../../services/ai/ai-router.js";
import { isLocalEnabled } from "../../services/ai/ai-providers.js";
import {
  resolveTokenBudget, chunkMaxChars, digestMaxChars, chunkSegments, createTokenPacer,
  createPipelineRunner, mapChunk, outputLanguageName, collectSections, buildDigest, reduceDocument, sourceKeyOf,
} from "./transcript-map-reduce.js";

const LOG_PREFIX = "[runly.calls/transcript-documents]";
const KINDS = ["MINUTA", "RESUMEN"];
// A PROCESSING row not touched for this long belongs to a run that died with
// the API process; it is reported (and stored) as FAILED so it can be retried.
const STALE_MS = 10 * 60 * 1000;

export class CallTranscriptDocumentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "CallTranscriptDocumentError";
    this.status = status;
  }
}

export function createCallTranscriptDocumentService({ prisma, env = process.env, fetchImpl = null, now = Date.now }) {
  const aiRouter = createAiRouter({ env, fetchImpl });
  const budget = resolveTokenBudget(env);
  // One pacer for the whole process: concurrent runs share the same TPM.
  const pacer = createTokenPacer({ budgetPerMinute: budget });
  const runner = createPipelineRunner({ aiRouter, pacer });

  async function loadTranscript(transcriptId) {
    const transcript = await prisma.callTranscript.findUnique({
      where: { id: transcriptId },
      include: { segments: { orderBy: { startMs: "asc" } }, call: { select: { startedAt: true } } },
    });
    if (!transcript) throw new CallTranscriptDocumentError("Transcripción no encontrada.", 404);
    if (transcript.status !== "READY") throw new CallTranscriptDocumentError("La transcripción todavía no está lista.", 409);
    if (!transcript.segments?.length) throw new CallTranscriptDocumentError("La transcripción no tiene contenido.", 422);
    return transcript;
  }

  function toPublic(row) {
    if (!row) return null;
    const { notes, ...rest } = row;
    const stale = row.status === "PROCESSING" && now() - new Date(row.updatedAt).getTime() > STALE_MS;
    return stale
      ? { ...rest, status: "FAILED", failureReason: "La generación se interrumpió. Vuelve a intentarlo." }
      : rest;
  }

  async function listDocuments({ transcriptId }) {
    const rows = await prisma.callTranscriptDocument.findMany({ where: { transcriptId } });
    return rows.map(toPublic);
  }

  // Complete (non-partial) cached notes matching this transcript's content.
  async function findCachedNotes(transcript) {
    const rows = await prisma.callTranscriptDocument.findMany({ where: { transcriptId: transcript.id } });
    const key = sourceKeyOf(transcript.segments);
    const row = rows.find((r) => r.notes?.sourceKey === key && !r.notes.partial);
    return row ? { chunks: row.notes.chunks, model: row.model } : null;
  }

  // Per-chunk notes of the transcript, from cache when its fingerprint still
  // matches, otherwise mapped now (reporting progress to `docId`).
  async function ensureNotes({ transcript, docId = null }) {
    const key = sourceKeyOf(transcript.segments);
    const cached = await findCachedNotes(transcript);
    if (cached) return cached;

    const chunks = chunkSegments(transcript.segments, { maxChars: chunkMaxChars(budget) });
    const lang = outputLanguageName(transcript.language ?? transcript.requestedLanguage);
    if (docId) await prisma.callTranscriptDocument.update({ where: { id: docId }, data: { progressTotal: chunks.length + 1, progressDone: 0 } });
    const notesList = [];
    let model = null;
    for (const chunk of chunks) {
      const mapped = await mapChunk(runner, chunk, lang);
      notesList.push(mapped.notes);
      model = mapped.model;
      if (docId) await prisma.callTranscriptDocument.update({ where: { id: docId }, data: { progressDone: notesList.length, notes: { sourceKey: key, partial: true, chunks: notesList } } });
    }
    return { chunks: notesList, model, sourceKey: key };
  }

  async function run({ docId, transcript, kind }) {
    try {
      const { chunks, model: mapModel, sourceKey } = await ensureNotes({ transcript, docId });
      const digest = await buildDigest(runner, chunks, { maxChars: digestMaxChars(budget) });
      const reduced = await reduceDocument(runner, kind, digest, outputLanguageName(transcript.language ?? transcript.requestedLanguage));
      const content = {
        kind,
        callStartedAt: transcript.call?.startedAt ?? null,
        durationMs: transcript.durationMs ?? transcript.segments[transcript.segments.length - 1]?.endMs ?? null,
        language: transcript.language ?? transcript.requestedLanguage ?? null,
        ...(kind === "MINUTA" ? { sections: collectSections(chunks) } : {}),
        ...reduced.content,
      };
      await prisma.callTranscriptDocument.update({
        where: { id: docId },
        data: {
          status: "READY",
          content,
          model: reduced.model ?? mapModel,
          failureReason: null,
          notes: { sourceKey: sourceKey ?? sourceKeyOf(transcript.segments), chunks },
          progressDone: chunks.length + 1,
          progressTotal: chunks.length + 1,
        },
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} fallo ${kind} de ${transcript.id}:`, err?.message ?? err);
      await prisma.callTranscriptDocument.update({
        where: { id: docId },
        data: { status: "FAILED", failureReason: String(err?.message ?? "No se pudo generar el documento.").slice(0, 300) },
      }).catch(() => {});
    }
  }

  async function startDocument({ transcriptId, kind, profileId }) {
    if (!KINDS.includes(kind)) throw new CallTranscriptDocumentError("Tipo de documento no válido.", 422);
    if (!env.GROQ_API_KEY && !isLocalEnabled(env)) {
      throw new CallTranscriptDocumentError("Análisis con IA no configurado (falta GROQ_API_KEY).", 503);
    }
    const transcript = await loadTranscript(transcriptId);
    const existing = await prisma.callTranscriptDocument.findUnique({ where: { transcriptId_kind: { transcriptId, kind } } });
    if (existing && toPublic(existing).status === "PROCESSING") return toPublic(existing);

    const data = {
      status: "PROCESSING", content: null, failureReason: null, model: null,
      progressDone: 0, progressTotal: 0, generatedByUserId: profileId, updatedAt: new Date(),
    };
    const row = existing
      ? await prisma.callTranscriptDocument.update({ where: { id: existing.id }, data })
      : await prisma.callTranscriptDocument.create({ data: { ...data, transcriptId, kind, companyId: transcript.companyId } });
    run({ docId: row.id, transcript, kind });
    return toPublic(row);
  }

  // Digest for the task/event analysis of a long transcript. Null when notes
  // are not ready yet; in that case a RESUMEN run is started so they will be.
  async function getAnalysisDigest({ transcript, profileId }) {
    const cached = await findCachedNotes(transcript);
    if (cached) return buildDigest(runner, cached.chunks, { maxChars: digestMaxChars(budget) });
    await startDocument({ transcriptId: transcript.id, kind: "RESUMEN", profileId });
    return null;
  }

  return { listDocuments, startDocument, getAnalysisDigest, loadTranscript };
}
