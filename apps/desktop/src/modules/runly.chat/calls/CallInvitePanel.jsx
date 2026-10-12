import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, PhoneCall, UserPlus, X } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

function unwrap(r) {
  return r?.data ?? r;
}

// Shown over the stage while the host is alone: the "add people" card.
// Quick actions (ring someone from the company, copy the guest link); the
// full invite dialog (`onOpenInvite`) has search, access mode and email.
export function CallInvitePanel({ conversationId, onClose, onOpenInvite = null }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [link, setLink] = useState(null);
  const [copied, setCopied] = useState("");
  const onceRef = useRef(false);

  useEffect(() => {
    if (onceRef.current || !conversationId || !token) return;
    onceRef.current = true;
    runly.calls.createLink(conversationId, token)
      .then((r) => setLink(unwrap(r)?.link ?? null))
      .catch(() => { /* the invite dialog still works as a fallback */ });
  }, [conversationId, token]);

  function copy(value, key) {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  const meetingId = link?.meetingId ?? link?.code;

  return (
    <div className="call-glass w-full rounded-3xl p-5 text-white sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-(--call-accent-soft) text-(--call-accent)">
          <UserPlus className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">Aún no hay nadie más</p>
          <p className="mt-0.5 text-sm text-white/60">Llama a alguien de tu empresa o comparte el enlace con invitados externos.</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {onOpenInvite && (
          <button
            type="button"
            onClick={onOpenInvite}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-(--call-accent) px-4 text-sm font-semibold text-(--brand-primary-foreground) transition-colors hover:bg-(--call-accent-hover)"
          >
            <PhoneCall className="h-4 w-4" aria-hidden /> Invitar personas
          </button>
        )}
        <button
          type="button"
          disabled={!link}
          onClick={() => link && copy(link.url, "url")}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold transition-colors hover:bg-white/15 disabled:opacity-50"
        >
          {copied === "url" ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
          {copied === "url" ? "Enlace copiado" : link ? "Copiar enlace" : "Generando enlace…"}
        </button>
      </div>

      {meetingId && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-black/25 px-4 py-3 ring-1 ring-white/10">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">ID de reunión</p>
            <code className="font-mono text-lg font-semibold tracking-[0.18em]">{meetingId}</code>
            <p className="text-[11px] text-white/45">Para entrar sin el enlace, en la página de invitados.</p>
          </div>
          <button
            type="button"
            onClick={() => copy(meetingId, "code")}
            aria-label="Copiar ID de reunión"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 hover:bg-white/15"
          >
            {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
