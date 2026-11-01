import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

const SETTINGS_KEY = ["chat-transcription-settings"];

// Engine choice + company glossary, in one payload ({ engine, externalAvailable,
// externalConsentAt, terms }).
export function useTranscriptionSettings(enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: SETTINGS_KEY,
    enabled: Boolean(enabled && session?.access_token),
    staleTime: 30_000,
    queryFn: async () => {
      const r = await runly.calls.getTranscriptionSettings(session.access_token);
      return r?.data ?? r;
    },
  });
}

export function useUpdateTranscriptionSettings() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    // { engine: "LOCAL" | "GROQ", acknowledgeExternal? }
    mutationFn: (body) => runly.calls.updateTranscriptionSettings(body, session.access_token),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useAddTranscriptionTerm() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    // { term, heardAs? } — heardAs makes it a replacement rule.
    mutationFn: (body) => runly.calls.addTranscriptionTerm(body, session.access_token),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useRemoveTranscriptionTerm() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (termId) => runly.calls.removeTranscriptionTerm(termId, session.access_token),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export function useUpdateTranscriptSegment(transcriptId) {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    // { segmentId, text } to edit, { segmentId, revert: true } to restore the engine's text.
    mutationFn: ({ segmentId, ...body }) => runly.calls.updateTranscriptSegment(transcriptId, segmentId, body, session.access_token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-transcript", transcriptId] });
      // A learned replacement shows up in the glossary.
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}
