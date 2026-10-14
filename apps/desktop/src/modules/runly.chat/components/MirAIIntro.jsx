// apps/desktop/src/modules/runly.chat/components/MirAIIntro.jsx
import { AssistantWordmark, MiraiAvatar } from "@runly/ui";
import { MIRAI_EXAMPLE_PROMPTS } from "../lib/mirai";

// Shown at the top of the MirAI conversation while it is still short.
// Clicking a chip prefills the composer (does not send).
export function MirAIIntro({ onPickPrompt }) {
  return (
    <div className="mx-auto my-6 max-w-md px-4 text-center">
      <MiraiAvatar size={88} animated className="mx-auto mb-3" />
      <p className="text-sm font-semibold"><AssistantWordmark /></p>
      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
        Puedo resumir mensajes, explicarte un mensaje o un archivo, y responder preguntas sobre tus chats.
        Reenvíame mensajes de otra conversación y pregúntame sobre ellos.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {MIRAI_EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPickPrompt?.(p)}
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))] transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
