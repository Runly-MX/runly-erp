# Plan: long transcript documents

Spec: `docs/superpowers/specs/2026-10-24-long-transcript-documents-design.md`

- [x] Pipeline: `apps/api/src/routes/calls/transcript-map-reduce.js` (+ unit tests)
- [x] Persistence: `CallTranscriptDocument` model + migration `20261118000000_call_transcript_documents`
- [x] Service + routes: `call-transcript-document-service.js`, `/calls/transcripts/:id/documents`
- [x] Analysis uses cached digest for long transcripts
- [x] SDK, hooks, `TranscriptDocumentsDialog`, PDF generator
- [x] MirAI: history clipping + friendly 413
- [ ] Verified with a real Groq run on a ~1 h transcript (needs `pnpm db:migrate` + `pnpm db:generate`, then API restart)
- [ ] Visual check of the generated PDFs
