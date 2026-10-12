import {
  cn,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@runly/ui";
import {
  Camera, CameraOff, Captions, CaptionsOff, Circle, Hand, Keyboard, LayoutGrid, LogOut, Maximize, MessageSquare,
  Mic, MicOff, MonitorUp, MoreHorizontal, PhoneOff, ScreenShareOff, Settings2, SmilePlus, StopCircle, Users,
  Volume2, PhoneMissed,
} from "lucide-react";
import { DockButton, DockSplitButton } from "../ui/DockButton";
import { ReactionPopover } from "./ReactionPopover";
import { MicDeviceMenu, CameraDeviceMenu } from "./DeviceMenus";
import { MOD_LABEL } from "../hooks/useCallShortcuts";

const LAYOUT_OPTIONS = [
  { value: "auto", label: "Automático" },
  { value: "focus", label: "Foco en quien habla" },
  { value: "grid", label: "Cuadrícula" },
];

function Divider() {
  return <span className="mx-1 h-8 w-px shrink-0 bg-white/10" aria-hidden />;
}

// Desktop control dock: icon + label controls grouped by purpose —
// devices | presence | more | panels | leave. `compact` drops the labels when
// the stage is narrow (tooltips keep the names).
export function CallControlDock({ ctl, room, mediaDevices, compact = false, className = "" }) {
  return (
    <div
      role="toolbar"
      aria-label="Controles de la llamada"
      className={cn("call-glass flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1.5", className)}
    >
      {ctl.needsAudio && (
        <>
          <DockButton icon={Volume2} label="Activar audio" tone="accent" onClick={ctl.activateAudio} compact={compact} />
          <Divider />
        </>
      )}

      <DockSplitButton
        icon={ctl.micEnabled ? Mic : MicOff}
        label="Micrófono"
        title={`${ctl.micEnabled ? "Silenciar" : "Activar"} micrófono (${MOD_LABEL}+D)`}
        tone={ctl.micEnabled ? "default" : "off"}
        pressed={!ctl.micEnabled}
        onClick={ctl.toggleMic}
        compact={compact}
        menuLabel="Elegir micrófono y altavoz"
        menu={<MicDeviceMenu room={room} micEnabled={ctl.micEnabled} mediaDevices={mediaDevices} onOpenSettings={ctl.openDeviceSettings} audioRoute={ctl.audioRoute} />}
      />
      <DockSplitButton
        icon={ctl.cameraEnabled ? Camera : CameraOff}
        label="Cámara"
        title={`${ctl.cameraEnabled ? "Apagar" : "Encender"} cámara (${MOD_LABEL}+E)`}
        tone={ctl.cameraEnabled ? "default" : "off"}
        pressed={!ctl.cameraEnabled}
        onClick={ctl.toggleCamera}
        compact={compact}
        menuLabel="Elegir cámara"
        menu={(
          <CameraDeviceMenu
            mediaDevices={mediaDevices}
            canSwitchCamera={ctl.canSwitchCamera}
            onSwitchCamera={ctl.switchCamera}
            torchSupported={ctl.torchSupported}
            torchEnabled={ctl.torchEnabled}
            onToggleTorch={ctl.toggleTorch}
            onOpenSettings={ctl.openDeviceSettings}
          />
        )}
      />

      <Divider />

      <DockButton
        icon={ctl.screenEnabled ? ScreenShareOff : MonitorUp}
        label={ctl.screenEnabled ? "Dejar de compartir" : "Compartir"}
        tone={ctl.screenEnabled ? "accent" : "default"}
        pressed={ctl.screenEnabled}
        onClick={ctl.toggleScreen}
        disabled={!ctl.screenShareSupported && !ctl.screenEnabled}
        compact={compact}
      />
      <ReactionPopover onReact={ctl.sendReaction}>
        <DockButton icon={SmilePlus} label="Reaccionar" compact={compact} />
      </ReactionPopover>
      <DockButton
        icon={Hand}
        label={ctl.myHandRaised ? "Bajar mano" : "Levantar mano"}
        title={`${ctl.myHandRaised ? "Bajar" : "Levantar"} la mano (${MOD_LABEL}+Shift+H)`}
        tone={ctl.myHandRaised ? "hand" : "default"}
        pressed={ctl.myHandRaised}
        onClick={ctl.toggleHand}
        compact={compact}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <DockButton icon={MoreHorizontal} label="Más" title="Más opciones" compact={compact} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" sideOffset={10} className="call-dialog z-60 w-72">
          {ctl.canRecord && (
            <DropdownMenuItem onSelect={ctl.toggleRecording} disabled={ctl.recordingBusy}>
              {ctl.recordingActive ? <StopCircle className="mr-2 h-4 w-4 text-red-400" /> : <Circle className="mr-2 h-4 w-4 text-red-400" />}
              {ctl.recordingActive ? "Detener grabación" : "Grabar reunión"}
            </DropdownMenuItem>
          )}
          {ctl.canTranscribeTracks && (
            <DropdownMenuItem onSelect={ctl.toggleTranscription} disabled={ctl.trackTranscriptionBusy}>
              {ctl.trackTranscriptionActive ? <CaptionsOff className="mr-2 h-4 w-4" /> : <Captions className="mr-2 h-4 w-4" />}
              {ctl.trackTranscriptionActive ? "Detener transcripción" : "Transcribir por persona"}
            </DropdownMenuItem>
          )}
          {(ctl.canRecord || ctl.canTranscribeTracks) && <DropdownMenuSeparator />}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <LayoutGrid className="mr-2 h-4 w-4" /> Diseño
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="call-dialog z-60">
              <DropdownMenuRadioGroup value={ctl.layoutPref} onValueChange={ctl.setLayoutPref}>
                {LAYOUT_OPTIONS.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={ctl.toggleFullscreen}>
            <Maximize className="mr-2 h-4 w-4" /> Pantalla completa
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={ctl.openDeviceSettings}>
            <Settings2 className="mr-2 h-4 w-4" /> Configuración de audio y video
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={ctl.openShortcuts}>
            <Keyboard className="mr-2 h-4 w-4" /> Atajos de teclado
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />

      <DockButton
        icon={Users}
        label="Personas"
        title={`Personas (${MOD_LABEL}+Shift+P)`}
        tone={ctl.panel === "people" ? "accent" : "default"}
        pressed={ctl.panel === "people"}
        onClick={() => ctl.togglePanel("people")}
        badge={ctl.lobbyCount || ctl.peopleCount}
        badgeTone={ctl.lobbyCount ? "warning" : "accent"}
        compact={compact}
      />
      <DockButton
        icon={MessageSquare}
        label="Chat"
        title={`Chat (${MOD_LABEL}+Shift+C)`}
        tone={ctl.panel === "chat" ? "accent" : "default"}
        pressed={ctl.panel === "chat"}
        onClick={() => ctl.togglePanel("chat")}
        badge={ctl.chatUnread}
        compact={compact}
      />

      <Divider />

      {ctl.canEndForAll ? (
        <DockSplitButton
          icon={PhoneOff}
          label="Salir"
          title="Salir de la reunión"
          tone="danger"
          wide
          onClick={ctl.leave}
          compact={compact}
          menuLabel="Opciones para salir"
          menuClassName="w-64"
          menu={(
            <>
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-white/50">Salir</DropdownMenuLabel>
              <DropdownMenuItem onSelect={ctl.leave}>
                <LogOut className="mr-2 h-4 w-4" /> Salir (la reunión sigue)
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-400 focus:text-red-400" onSelect={ctl.requestEndForAll}>
                <PhoneMissed className="mr-2 h-4 w-4" /> Finalizar para todos
              </DropdownMenuItem>
            </>
          )}
        />
      ) : (
        <DockButton icon={PhoneOff} label="Salir" tone="danger" wide onClick={ctl.leave} compact={compact} />
      )}
    </div>
  );
}
