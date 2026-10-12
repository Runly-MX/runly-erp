import { useState } from "react";
import { cn, Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@runly/ui";
import {
  Camera, CameraOff, Captions, CaptionsOff, Circle, Flashlight, FlashlightOff, Hand, LayoutGrid, MessageSquare,
  Mic, MicOff, MonitorUp, MoreHorizontal, PhoneMissed, PhoneOff, ScreenShareOff, Settings2, SmilePlus, StopCircle,
  SwitchCamera, Users, Volume2,
} from "lucide-react";
import { MobileCallButton } from "../ui/DockButton";
import { ReactionPopover } from "./ReactionPopover";

const LAYOUT_LABEL = { auto: "Automático", focus: "Foco", grid: "Cuadrícula" };
const LAYOUT_NEXT = { auto: "focus", focus: "grid", grid: "auto" };

function ActionTile({ icon: Icon, label, onClick, tone = "default", badge, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 rounded-2xl p-2 text-center transition-colors active:bg-white/5 disabled:opacity-40"
    >
      <span
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-2xl",
          tone === "accent" ? "bg-(--call-accent) text-(--brand-primary-foreground)"
            : tone === "hand" ? "bg-(--call-hand) text-amber-950"
              : tone === "rec" ? "bg-red-500/20 text-red-300 ring-1 ring-red-400/40"
                : "bg-white/[0.07] text-white ring-1 ring-white/10",
        )}
      >
        <Icon className="h-6 w-6" aria-hidden />
        {badge ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--call-accent) px-1 text-[10px] font-bold text-(--brand-primary-foreground)">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className="text-xs leading-tight text-white/85">{label}</span>
    </button>
  );
}

// Phone bottom bar: the five controls people reach for (Meet/WhatsApp-like),
// everything else lives in the "Más" sheet.
export function MobileCallBar({ ctl, hidden = false }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const run = (fn) => () => { setMoreOpen(false); fn?.(); };

  return (
    <>
      <nav
        aria-label="Controles de la llamada"
        data-hidden={hidden}
        className="call-chrome call-chrome-bottom flex items-start justify-around gap-1 px-2 pt-2"
        style={{ paddingBottom: "calc(0.6rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <MobileCallButton
          icon={ctl.micEnabled ? Mic : MicOff}
          label={ctl.micEnabled ? "Silenciar" : "Activar"}
          tone={ctl.micEnabled ? "default" : "off"}
          pressed={!ctl.micEnabled}
          onClick={ctl.toggleMic}
        />
        <MobileCallButton
          icon={ctl.cameraEnabled ? Camera : CameraOff}
          label="Cámara"
          tone={ctl.cameraEnabled ? "default" : "off"}
          pressed={!ctl.cameraEnabled}
          onClick={ctl.toggleCamera}
        />
        <ReactionPopover onReact={ctl.sendReaction}>
          <MobileCallButton icon={SmilePlus} label="Reaccionar" />
        </ReactionPopover>
        <MobileCallButton
          icon={MoreHorizontal}
          label="Más"
          badge={ctl.lobbyCount || ctl.chatUnread || null}
          badgeTone={ctl.lobbyCount ? "warning" : "accent"}
          onClick={() => setMoreOpen(true)}
        />
        <MobileCallButton icon={PhoneOff} label="Salir" tone="danger" onClick={ctl.leave} />
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="call-dialog gap-3" style={{ zIndex: 10002 }}>
          <SheetHeader className="text-left">
            <SheetTitle className="text-base text-white">Más opciones</SheetTitle>
            <SheetDescription className="sr-only">Acciones adicionales de la llamada</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-4 gap-1">
            {ctl.needsAudio && <ActionTile icon={Volume2} label="Activar audio" tone="accent" onClick={run(ctl.activateAudio)} />}
            <ActionTile icon={Users} label="Personas" badge={ctl.lobbyCount || ctl.peopleCount} onClick={run(() => ctl.togglePanel("people"))} />
            <ActionTile icon={MessageSquare} label="Chat" badge={ctl.chatUnread} onClick={run(() => ctl.togglePanel("chat"))} />
            <ActionTile
              icon={Hand}
              label={ctl.myHandRaised ? "Bajar mano" : "Levantar mano"}
              tone={ctl.myHandRaised ? "hand" : "default"}
              onClick={run(ctl.toggleHand)}
            />
            <ActionTile
              icon={ctl.screenEnabled ? ScreenShareOff : MonitorUp}
              label={ctl.screenEnabled ? "Dejar de compartir" : "Compartir pantalla"}
              tone={ctl.screenEnabled ? "accent" : "default"}
              disabled={!ctl.screenShareSupported && !ctl.screenEnabled}
              onClick={run(ctl.toggleScreen)}
            />
            {ctl.canSwitchCamera && ctl.cameraEnabled && (
              <ActionTile icon={SwitchCamera} label="Girar cámara" onClick={run(ctl.switchCamera)} />
            )}
            {ctl.torchSupported && (
              <ActionTile
                icon={ctl.torchEnabled ? FlashlightOff : Flashlight}
                label={ctl.torchEnabled ? "Apagar linterna" : "Linterna"}
                onClick={run(ctl.toggleTorch)}
              />
            )}
            {ctl.canRecord && (
              <ActionTile
                icon={ctl.recordingActive ? StopCircle : Circle}
                label={ctl.recordingActive ? "Detener grabación" : "Grabar"}
                tone={ctl.recordingActive ? "rec" : "default"}
                disabled={ctl.recordingBusy}
                onClick={run(ctl.toggleRecording)}
              />
            )}
            {ctl.canTranscribeTracks && (
              <ActionTile
                icon={ctl.trackTranscriptionActive ? CaptionsOff : Captions}
                label={ctl.trackTranscriptionActive ? "Detener transcripción" : "Transcribir"}
                disabled={ctl.trackTranscriptionBusy}
                onClick={run(ctl.toggleTranscription)}
              />
            )}
            <ActionTile
              icon={LayoutGrid}
              label={`Diseño: ${LAYOUT_LABEL[ctl.layoutPref] ?? "Automático"}`}
              onClick={() => ctl.setLayoutPref(LAYOUT_NEXT[ctl.layoutPref] ?? "auto")}
            />
            <ActionTile icon={Settings2} label="Audio y video" onClick={run(ctl.openDeviceSettings)} />
          </div>
          {ctl.audioRoute?.supported && (
            <div className="space-y-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-white/50">Salida de audio</p>
              <div role="radiogroup" aria-label="Salida de audio" className="flex flex-wrap gap-2">
                {ctl.audioRoute.routes.map((route) => {
                  const selected = ctl.audioRoute.active === route.id;
                  return (
                    <button
                      key={route.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => ctl.audioRoute.select(route.id)}
                      className={cn(
                        "min-h-11 rounded-xl px-4 text-sm font-semibold ring-1 transition-colors",
                        selected ? "bg-(--call-accent) text-(--brand-primary-foreground) ring-transparent" : "bg-white/[0.06] text-white ring-white/10",
                      )}
                    >
                      {route.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {ctl.canEndForAll && (
            <button
              type="button"
              onClick={run(ctl.requestEndForAll)}
              className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-600/15 text-sm font-semibold text-red-300 ring-1 ring-red-500/30 active:bg-red-600/25"
            >
              <PhoneMissed className="h-4 w-4" /> Finalizar la reunión para todos
            </button>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
