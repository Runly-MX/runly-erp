// apps/desktop/src/modules/runly.chat/components/TtsNowPlayingBar.jsx
//
// WhatsApp-style persistent indicator for "leer en voz alta" — unlike the
// per-message icon (which you can easily scroll away from), this stays
// pinned right under the header so it's always obvious that (a) something
// is being synthesized, or (b) audio is currently playing, and gives a way
// to stop it without hunting for the message that started it.
import { Loader2, Volume2, Square } from "lucide-react";

export function TtsNowPlayingBar({ speech }) {
  if (!speech?.isAnyLoading && !speech?.isAnyPlaying) return null;

  const loading = speech.isAnyLoading;

  return (
    <div className="chat-glass chat-float-bar mx-2 mt-1.5 flex items-center gap-2 rounded-xl px-3 py-1.5 text-[var(--brand-primary)] shrink-0">
      {loading
        ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        : <Volume2 className="h-3.5 w-3.5 shrink-0" />}
      <span className="flex-1 min-w-0 truncate text-xs font-medium">
        {loading ? "Generando audio…" : "Reproduciendo audio…"}
      </span>
      <button
        type="button"
        onClick={() => speech.stop()}
        title="Detener"
        aria-label="Detener lectura"
        className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full hover:bg-[var(--brand-primary)]/15 transition-colors touch-manipulation"
      >
        <Square className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
