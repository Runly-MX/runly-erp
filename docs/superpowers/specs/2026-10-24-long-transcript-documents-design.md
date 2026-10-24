# Long transcript documents (minuta / resumen ejecutivo)

Status: approved by the product owner (2026-10-24), implemented the same day.

## Problem
A one-hour call transcript is 15-20k tokens. Groq's `on_demand` tier rejects any
request over its per-request/per-minute token limit (413, `gpt-oss-120b`), so
the existing single-call analysis truncated at 60,000 characters and failed;
pasting a transcript into MirAI failed the same way.

## Design
Server-side map-reduce, run in the background, persisted in
`CallTranscriptDocument` (`MINUTA` | `RESUMEN`, one row per transcript and kind).

1. Chunk the segments by size (`chunkMaxChars`, derived from `TRANSCRIPT_AI_TPM`),
   with a 2-line overlap, keeping timestamps.
2. Map: one call per chunk -> notes (sections with title/gist/body/bullets,
   decisions, actions, risks, pending). Notes are cached on the row and reused by
   the other kind and by the task analysis (invalidated by a segment fingerprint).
3. Digest: compact text of all notes, condensed recursively if it still exceeds
   the single-call budget.
4. Reduce: one call over the digest for the global parts (objective, executive
   summary, consolidated commitments, risks, open decisions, conclusions for the
   minuta; overview, findings, priorities for the resumen). Minuta sections are
   the map sections verbatim, so section bodies are never re-sent.
5. A process-wide token pacer reserves `input + max_tokens` per call against the
   TPM budget and waits instead of failing; 429s honor `Retry-After`.
6. API: `GET/POST /calls/transcripts/:id/documents`. A `PROCESSING` row untouched
   for 10 minutes is reported as `FAILED` (the API process died mid-run).
7. UI: "Minuta y resumen" dialog on the transcript viewer (progress, retry) and
   client-side PDF (`transcriptDocumentPdf.js`, jsPDF).
8. `analyzeTranscript` (tasks/events) uses the cached digest for long transcripts;
   if notes are not ready it starts a background run and answers 409 with a hint.
9. MirAI: history messages are clipped to 4,000 chars and a provider 413 now
   explains how to process a long text instead of a generic failure.

## Non-goals
Streaming partial documents; editing the generated document in the UI; changing
the Groq model.

## Follow-up (separate spec)
Playback: transcript side panel synced with the recording viewer (click-to-seek).
Verify that segment `startMs` aligns with the recording's start before building it.
