import { Button } from "@runly/ui";
import { Disc, Mic, Phone, Video } from "lucide-react";

// Call shortcuts on a conversation profile: voice, video and (when allowed)
// an in-person recording, plus a link to the conversation's recordings.
export function ProfileCallActions({ disabled, onStartAudioCall, onStartVideoCall, onStartInPerson, onShowRecordings }) {
  const actions = [
    {
      label: "Llamada",
      description: "Solo audio",
      icon: Phone,
      onClick: onStartAudioCall,
    },
    {
      label: "Videollamada",
      description: "Audio y video",
      icon: Video,
      onClick: onStartVideoCall,
    },
    ...(onStartInPerson ? [{
      label: "Presencial",
      description: "Grabar en sala",
      icon: Mic,
      onClick: onStartInPerson,
    }] : []),
  ];

  return (
    <div className={["grid gap-2 px-4 pb-4", actions.length === 3 ? "grid-cols-3" : "grid-cols-2"].join(" ")}>
      {actions.map(({ label, description, icon: Icon, onClick }) => (
        <Button
          key={label}
          type="button"
          variant="outline"
          onClick={onClick}
          disabled={disabled}
          aria-label={`Iniciar ${label.toLowerCase()}`}
          aria-busy={disabled || undefined}
          className="h-auto min-h-[72px] flex-col gap-1.5 rounded-xl border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-3 text-center shadow-sm hover:border-[var(--brand-primary)]/45 hover:bg-[var(--brand-primary)]/6"
        >
          <Icon className="h-4 w-4 text-[var(--brand-primary)]" />
          <span className="text-xs font-semibold leading-none">{label}</span>
          <span className="text-[10px] font-normal leading-none text-[hsl(var(--muted-foreground))]">
            {disabled ? "Conectando..." : description}
          </span>
        </Button>
      ))}
      {onShowRecordings && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onShowRecordings}
          className="col-span-full justify-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]"
        >
          <Disc className="h-3.5 w-3.5" />
          Ver grabaciones de llamadas
        </Button>
      )}
    </div>
  );
}
