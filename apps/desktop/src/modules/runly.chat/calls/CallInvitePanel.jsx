import { useEffect, useRef, useState } from "react";
import { TagsField } from "@runly/ui";
import { Copy, Check, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { summarizeInviteResult, describeInviteOutcome } from "./lib/inviteResult";
import { CallAccessSettings } from "./CallAccessSettings";

function unwrap(r) {
  return r?.data ?? r;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shown centered in the call room while the host is alone (no other members,
// no guests) — the Meet "add people" card. Generates / fetches the guest link
// on mount and offers quick email invites.
export function CallInvitePanel({ conversationId, onClose }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [link, setLink] = useState(null);
  const [emails, setEmails] = useState([]);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState("");
  const onceRef = useRef(false);

  useEffect(() => {
    if (onceRef.current || !conversationId || !token) return;
    onceRef.current = true;
    runly.calls.createLink(conversationId, token)
      .then((r) => setLink(unwrap(r)?.link ?? null))
      .catch(() => { /* the "Compartir" dialog still works as a fallback */ });
  }, [conversationId, token]);

  function copy(value, key) {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  async function send() {
    if (!emails.length) return;
    setSending(true);
    try {
      const res = unwrap(await runly.calls.sendInvites(conversationId, emails, token));
      const { notice } = summarizeInviteResult(res);
      const outcome = describeInviteOutcome(res);
      if (outcome) toast.success(outcome);
      if (notice) {
        toast.message(notice.title, notice.description ? { description: notice.description } : undefined);
      }
      setEmails([]);
    } catch (e) {
      toast.error(e?.message || "No se pudieron enviar.");
    } finally {
      setSending(false);
    }
  }

  async function patchLink(next) {
    if (!link) return;
    try {
      const r = await runly.calls.updateLink(conversationId, next, token);
      setLink(unwrap(r)?.link ?? link);
    } catch (e) {
      toast.error(e?.message || "No se pudo cambiar el acceso.");
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-slate-900/90 p-5 text-slate-100 shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4 text-slate-400" />
        <span className="flex-1">Aún no hay nadie más</span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {link ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            <input
              readOnly
              value={link.url}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => copy(link.url, "url")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20"
              title="Copiar enlace"
            >
              {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mb-4 flex items-center gap-2 text-xs text-slate-400">
            <span>ID de reunión:</span>
            <code className="font-mono text-sm tracking-wider text-slate-100">{link.meetingId ?? link.code}</code>
            <button type="button" onClick={() => copy(link.meetingId ?? link.code, "code")} className="text-slate-400 hover:text-slate-100" aria-label="Copiar ID de reunión">
              {copied === "code" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </>
      ) : (
        <p className="mb-4 text-xs text-slate-400">Generando enlace de invitados…</p>
      )}

      {link ? (
        <div className="mb-4">
          <span className="mb-1.5 block text-xs text-slate-400">Acceso de invitados</span>
          <CallAccessSettings link={link} onPatch={patchLink} tone="dark" />
        </div>
      ) : null}

      <TagsField
        label="Invitar por correo"
        placeholder="correo@ejemplo.com"
        value={emails}
        onChange={setEmails}
        type="email"
        inputMode="email"
        normalizeItem={(v) => v.trim().toLowerCase()}
        validateItem={(v) => (EMAIL_RE.test(v) ? null : "Correo no válido")}
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={send}
          disabled={sending || !emails.length}
          className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-primary-foreground)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" /> {sending ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </div>
  );
}
