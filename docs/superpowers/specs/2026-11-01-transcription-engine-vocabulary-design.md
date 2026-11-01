# Transcription: hosted engine, vocabulary and corrections

Status: implemented 2026-11-01 (runly.calls transcripts).

## Problem

Meetings mix Spanish with English and domain jargon (technology, beauty,
engineering, architecture). The local `small` faster-whisper model, forced to
`es` and with one global `WHISPER_INITIAL_PROMPT`, mishears acronyms, brands and
names, and drops stretches of weak audio. Measured on a real 58 minute mixed
recording: a 3 minute stretch was lost, "BACnet" came out as "Baglet",
"Schindler" as "Schittler", "back office" as "barco ofis".

## Design

1. Engine per company (`call_transcription_settings.engine`, LOCAL | GROQ).
   GROQ needs `GROQ_API_KEY` on the instance and a recorded consent
   (`external_consent_at/by`): only audio, never video, leaves the server. The API resolves
   the engine when a transcript is requested or regenerated and stores it on
   `call_transcript.requested_engine`, because `apps/transcriber` only talks to
   the database. The worker cuts the audio into 10 minute mono Opus chunks
   (24 kbps), calls Groq `whisper-large-v3-turbo`, retries rate limits
   (`retry-after`, bounded), and transcribes a chunk locally if Groq cannot
   serve it. `call_transcript.model` records which engines contributed.
2. Vocabulary hint per transcript (`call_transcript.vocabulary_prompt`): a
   label-free sentence built from the call's participants, the calendar event
   title and the company glossary (`call_transcription_term`), max 560 chars.
   Labels such as "Participantes:" are avoided because Whisper repeats them.
   The worker appends the end of the previous chunk for continuity.
3. Corrections. The transcript analysis also returns `corrections`
   (`wrong` -> `right`); only pairs whose `wrong` appears in the transcript are
   applied (whole-word, never sentence rewrites). Segments keep the engine's
   text in `original_text`, restorable from the viewer.
4. Learning. A manual line edit that is a small word replacement is stored as a
   glossary term (`LEARNED`). A replacement rule is applied automatically to new
   transcripts once trusted: `MANUAL` at once, `LEARNED` after 2 occurrences,
   `AI` after 3. Every distinct term also feeds the Whisper hint.
5. Both engines drop Whisper repetition loops ("esto es / esto es ...").

## Quotas (Groq free tier, verify on the account's limits page)

About 8 hours of audio per day per organisation; a 58 minute mixed meeting is
about 12% of that. PER_TRACK transcripts multiply audio by participants.

## Verification

Real recording, 58 min, hosted engine: 57 s, 6 chunks, no fallback; the 3 minute
loss and the "Baglet" / "barco ofis" / loop errors are gone. Tests:
`apps/transcriber/test_engine.py`, `call-transcript-vocabulary.test.js`,
`call-transcription-routes.test.js`, plus one case in
`call-transcript-analysis-service.test.js`.

## Not done

Per-participant tracks for recordings that were captured mixed (needs a capture
change), and surfacing the engine used in the viewer.
