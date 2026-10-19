import { createPortal } from "react-dom";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, useIsMobile,
} from "@runly/ui";
import { Phone, PhoneOff, Video, Mic } from "lucide-react";
import { CallAvatar } from "./ui/CallAvatar";
import "./ui/call-ui.css";

function RoundAction({ icon: Icon, label, tone, onClick, disabled = false }) {
  const tones = {
    decline: "bg-red-600 text-white active:bg-red-500",
    accept: "bg-emerald-500 text-white active:bg-emerald-400",
    neutral: "bg-white/10 text-white ring-1 ring-white/15 active:bg-white/20",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-2 disabled:opacity-50">
      <span className={`flex h-18 w-18 items-center justify-center rounded-full shadow-xl transition-transform active:scale-95 ${tones[tone]}`}>
        <Icon className="h-8 w-8" aria-hidden />
      </span>
      <span className="text-sm font-medium text-white/85">{label}</span>
    </button>
  );
}

// Incoming call. Phones get a full-screen native-style screen; desktops a
// compact card. Video calls can be answered with the camera off.
export function IncomingCallDialog({ call, isStarting, onAccept, onDecline }) {
  const isMobile = useIsMobile();
  const isVideo = call?.kind === "VIDEO";
  const callerName = call?.initiator?.displayName ?? "Alguien";
  const callerId = call?.initiator?.id ?? call?.initiatedByUserId ?? callerName;
  const subtitle = isVideo ? "Videollamada entrante" : "Llamada entrante";
  if (!call) return null;

  if (isMobile) {
    return createPortal(
      <div
        role="alertdialog"
        aria-label={`${subtitle} de ${callerName}`}
        className="runly-call fixed inset-0 z-10010 flex flex-col items-center justify-between px-6 text-center"
        style={{ paddingTop: "calc(4rem + var(--sat))", paddingBottom: "calc(3rem + var(--sab))" }}
      >
        <div className="flex flex-col items-center gap-5">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/55">{subtitle}</p>
          <span className="rounded-full p-3 ring-1 ring-white/10">
            <CallAvatar name={callerName} seed={callerId} url={call?.initiator?.avatarUrl} size="xl" speaking />
          </span>
          <h2 className="max-w-full truncate text-3xl font-semibold text-white">{callerName}</h2>
        </div>
        <div className="flex w-full max-w-xs items-start justify-between">
          <RoundAction icon={PhoneOff} label="Rechazar" tone="decline" onClick={onDecline} />
          {isVideo && (
            <RoundAction icon={Mic} label="Solo audio" tone="neutral" disabled={isStarting} onClick={() => onAccept({ camera: false })} />
          )}
          <RoundAction icon={isVideo ? Video : Phone} label="Contestar" tone="accept" disabled={isStarting} onClick={() => onAccept()} />
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDecline(); }}>
      <DialogContent size="sm" mobileVariant="center" className="call-dialog runly-call overflow-hidden">
        <DialogHeader className="items-center text-center">
          <CallAvatar name={callerName} seed={callerId} url={call?.initiator?.avatarUrl} size="lg" speaking className="mb-2" />
          <DialogTitle className="text-center text-xl text-white">{callerName}</DialogTitle>
          <DialogDescription className="text-center text-white/60">{subtitle}</DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex items-center justify-center gap-3">
          <button type="button" onClick={onDecline} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500">
            <PhoneOff className="h-4 w-4" /> Rechazar
          </button>
          {isVideo && (
            <button type="button" onClick={() => onAccept({ camera: false })} disabled={isStarting} title="Contestar sin cámara" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50">
              <Mic className="h-4 w-4" /> Solo audio
            </button>
          )}
          <button type="button" onClick={() => onAccept()} disabled={isStarting} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50">
            {isVideo ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />} Contestar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
