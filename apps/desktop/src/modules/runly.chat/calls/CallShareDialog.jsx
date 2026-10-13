import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, cn } from "@runly/ui";
import { Globe, Users } from "lucide-react";
import { useAuth } from "../../../auth/AuthProvider";
import { InternalInvitePane } from "./invite/InternalInvitePane";
import { ExternalInvitePane } from "./invite/ExternalInvitePane";
import "./ui/call-ui.css";

const EMPTY = new Set();

// "Invitar": two ways in. Company people are rung in the app (only while a
// call is live, so there is something to ring into); external guests get a
// link / meeting ID. From the call room it uses the call's dark surface.
export function CallShareDialog({ open, onOpenChange, conversationId, callId = null, inCallIds = EMPTY, memberIds = EMPTY, inCall = false }) {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const canRing = Boolean(callId);
  const [tab, setTab] = useState(canRing ? "internal" : "external");
  useEffect(() => {
    if (open) setTab(canRing ? "internal" : "external");
  }, [open, canRing]);

  const tabs = useMemo(() => [
    canRing && { value: "internal", label: "Personas de la empresa", icon: Users },
    { value: "external", label: "Invitados externos", icon: Globe },
  ].filter(Boolean), [canRing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" scrollable className={cn("gap-0 p-0 md:min-h-[min(30rem,90dvh)] md:max-h-[min(46rem,90dvh)] md:p-0", inCall && "call-dialog")}>
        <DialogHeader className="shrink-0 space-y-1 px-6 pb-4 pt-6">
          <DialogTitle className="text-xl">Invitar a la reunión</DialogTitle>
          <DialogDescription>
            {canRing
              ? "Llama a alguien de tu empresa o comparte un enlace con quien no tiene cuenta."
              : "Comparte el enlace o el ID con quien no tiene cuenta en Runly."}
          </DialogDescription>
        </DialogHeader>
        {tabs.length > 1 && (
          <div role="tablist" aria-label="Tipo de invitación" className="mx-6 mb-4 grid shrink-0 grid-cols-2 gap-1 rounded-2xl bg-[hsl(var(--muted))]/50 p-1">
            {tabs.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.value)}
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-(--brand-primary) text-(--brand-primary-foreground) shadow-md"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                  )}
                >
                  <t.icon className="h-4 w-4" aria-hidden />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {open && (
          <div key={tab} className="call-fade-up flex min-h-0 flex-1 flex-col">
            {tab === "internal" && canRing ? (
              <InternalInvitePane callId={callId} token={token} inCallIds={inCallIds} memberIds={memberIds} selfId={userProfile?.id} />
            ) : (
              <ExternalInvitePane conversationId={conversationId} token={token} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
