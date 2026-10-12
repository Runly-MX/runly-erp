import { useEffect, useRef, useState } from "react";
import { Button, TagsField, NumberField, ConfirmDialog } from "@runly/ui";
import { Copy, Check, Hash, Link2, Mail, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../../../lib/runly";
import { summarizeInviteResult, describeInviteOutcome } from "../lib/inviteResult";
import { CallAccessSettings } from "../CallAccessSettings";

function unwrap(r) {
  return r?.data ?? r;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Section({ icon: Icon, title, hint, children }) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--brand-primary)/15 text-(--brand-primary)">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

// "Invitados externos": the guest link, the meeting ID (for joining without
// the link), who gets in directly (access mode / PIN) and email invites.
export function ExternalInvitePane({ conversationId, token }) {
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [emails, setEmails] = useState([]);
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [maxUsesDraft, setMaxUsesDraft] = useState("");
  const maxUsesTimerRef = useRef(null);
  const maxUsesPendingRef = useRef(null);

  useEffect(() => {
    if (!conversationId || !token) return;
    setLoading(true);
    runly.calls.createLink(conversationId, token)
      .then((r) => setLink(unwrap(r)?.link ?? null))
      .catch((e) => toast.error(e?.message || "No se pudo generar el enlace."))
      .finally(() => setLoading(false));
  }, [conversationId, token]);

  // Only re-seed the draft when a *different* link loads (e.g. regenerate) —
  // not on every patch response, or a keystroke could get overwritten by a
  // stale response for a value the user has since changed.
  useEffect(() => {
    setMaxUsesDraft(link?.maxUses ?? "");
  }, [link?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (maxUsesTimerRef.current) {
      clearTimeout(maxUsesTimerRef.current);
      patch({ maxUses: maxUsesPendingRef.current });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(next) {
    try {
      const r = await runly.calls.updateLink(conversationId, next, token);
      setLink(unwrap(r)?.link ?? link);
    } catch (e) { toast.error(e?.message || "No se pudo actualizar."); }
  }

  // Debounced: one PATCH per keystroke with no ordering guard could leave
  // the field showing a stale intermediate digit.
  function scheduleMaxUsesPatch(value) {
    maxUsesPendingRef.current = value;
    if (maxUsesTimerRef.current) clearTimeout(maxUsesTimerRef.current);
    maxUsesTimerRef.current = setTimeout(() => {
      maxUsesTimerRef.current = null;
      patch({ maxUses: maxUsesPendingRef.current });
    }, 500);
  }

  async function regenerate() {
    setLoading(true);
    try {
      await runly.calls.revokeLink(conversationId, token);
      const r = await runly.calls.createLink(conversationId, token);
      setLink(unwrap(r)?.link ?? null);
      toast.success("Enlace regenerado.");
    } catch (e) {
      toast.error(e?.message || "No se pudo regenerar.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    try {
      await runly.calls.revokeLink(conversationId, token);
      setLink(null);
      setConfirmRevoke(false);
      toast.success("Enlace revocado.");
    } catch (e) { toast.error(e?.message || "No se pudo revocar."); }
  }

  async function sendInvites() {
    if (!emails.length) return;
    try {
      const r = unwrap(await runly.calls.sendInvites(conversationId, emails, token));
      setInviteResult(r);
      setEmails([]);
      const { notice } = summarizeInviteResult(r);
      const outcome = describeInviteOutcome(r);
      if (outcome) toast.success(outcome);
      if (notice) {
        toast.message(notice.title, notice.description ? { description: notice.description } : undefined);
      }
    } catch (e) { toast.error(e?.message || "No se pudieron enviar."); }
  }

  function copy(value, key) {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  if (loading && !link) {
    return <p className="px-6 py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">Generando enlace…</p>;
  }
  if (!link) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">No hay un enlace activo para invitados.</p>
        <Button onClick={regenerate}>Generar enlace</Button>
      </div>
    );
  }

  const meetingId = link.meetingId ?? link.code;
  const joinPage = link.url.replace(/\/p\/call\/.*$/, "/p/call");

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-5">
      <Section icon={Link2} title="Enlace de invitado" hint="La forma más fácil: quien lo abre llega directo a esta reunión, sin escribir nada.">
        <div className="flex gap-2">
          <input
            readOnly
            value={link.url}
            onFocus={(e) => e.target.select()}
            aria-label="Enlace de invitado"
            className="min-w-0 flex-1 truncate rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]/60 px-3 py-2.5 text-sm"
          />
          <Button onClick={() => copy(link.url, "url")} className="shrink-0">
            {copied === "url" ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
            {copied === "url" ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </Section>

      <Section
        icon={Hash}
        title="ID de reunión"
        hint={`Para quien no tiene el enlace (por ejemplo, te lo dictan por teléfono): abre ${joinPage} y escribe este ID. El enlace ya lo incluye, así que con el enlace no hace falta.`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-xl bg-[hsl(var(--background))]/60 px-4 py-2 font-mono text-xl font-semibold tracking-[0.18em]">{meetingId}</code>
          <Button variant="secondary" size="icon" onClick={() => copy(meetingId, "code")} title="Copiar ID de reunión" aria-label="Copiar ID de reunión">
            {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={regenerate} title="Generar otro enlace e ID" aria-label="Generar otro enlace e ID" disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Section>

      <Section icon={Check} title="Quién entra directo" hint="Con el enlace o con el ID, esto decide si el invitado espera a que lo admitas.">
        <CallAccessSettings link={link} onPatch={patch} disabled={loading} />
        <div className="mt-3 max-w-56">
          <NumberField
            label="Máximo de usos (opcional)"
            value={maxUsesDraft}
            min={1}
            onChange={(e) => {
              const n = Number(e.target.value);
              const next = Number.isFinite(n) && n > 0 ? n : "";
              setMaxUsesDraft(next);
              scheduleMaxUsesPatch(next === "" ? null : next);
            }}
          />
        </div>
      </Section>

      <Section icon={Mail} title="Invitar por correo" hint="Les llega el enlace, el ID y, si aplica, el PIN. Si ya tienen cuenta en la empresa, además les suena en la app.">
        <TagsField
          placeholder="ana@empresa.com  (Enter para agregar)"
          value={emails}
          onChange={setEmails}
          type="email"
          inputMode="email"
          normalizeItem={(v) => v.trim().toLowerCase()}
          validateItem={(v) => (EMAIL_RE.test(v) ? null : "Correo no válido")}
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={sendInvites} disabled={!emails.length}>Enviar invitaciones</Button>
        </div>
        {(inviteResult?.notifiedUsers?.length ?? inviteResult?.matchedUsers?.length ?? 0) > 0 && (
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            {inviteResult.notifiedUsers?.length ?? inviteResult.matchedUsers.length} ya tienen cuenta: se
            añadieron a la reunión y recibieron el aviso de llamada en la app.
          </p>
        )}
        {inviteResult?.pendingManual?.length > 0 && (
          <p className="mt-2 text-xs text-amber-500">
            {inviteResult.smtpConfigured === false
              ? "El servidor de correo (SMTP) no está configurado en Ajustes. Copia y comparte el enlace manualmente."
              : inviteResult.sendError
                ? `El correo está configurado pero el envío falló: ${inviteResult.sendError}`
                : "No se pudieron enviar algunos correos. Comparte el enlace manualmente."}
          </p>
        )}
        {inviteResult?.pendingManual?.map((p) => (
          <div key={p.inviteId} className="mt-2 flex items-center gap-2 text-xs">
            <span className="truncate text-[hsl(var(--muted-foreground))]">{p.email}: envío pendiente</span>
            <button type="button" className="underline" onClick={() => copy(p.url, p.inviteId)}>
              {copied === p.inviteId ? "copiado" : "copiar enlace"}
            </button>
          </div>
        ))}
      </Section>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-[hsl(var(--muted-foreground))]">{link.useCount} uso(s) del enlace</span>
        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setConfirmRevoke(true)}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Revocar enlace
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Revocar enlace"
        description="El enlace y el ID de reunión dejarán de funcionar. Los invitados conectados serán expulsados."
        confirmLabel="Revocar"
        variant="destructive"
        onConfirm={revoke}
      />
    </div>
  );
}
