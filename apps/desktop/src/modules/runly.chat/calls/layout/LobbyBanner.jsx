import { Check, DoorOpen, X } from "lucide-react";
import { CallAvatar } from "../ui/CallAvatar";

// Host-only strip over the stage while guests wait in the lobby, so
// admitting doesn't depend on catching a toast or digging through "Más".
// One guest: admit / deny inline. Several: admit all or open Personas.
export function LobbyBanner({ lobby, onAdmit, onDeny, onAdmitAll, onOpen }) {
  if (!lobby?.length) return null;
  const first = lobby[0];
  const single = lobby.length === 1;
  return (
    <div className="call-fade-up pointer-events-auto mx-auto flex w-full max-w-xl items-center gap-3 rounded-2xl bg-amber-400/15 px-3 py-2.5 text-white shadow-xl ring-1 ring-amber-300/40 backdrop-blur-xl">
      {single ? (
        <CallAvatar name={first.displayName} seed={first.id} size="sm" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/25 text-amber-200">
          <DoorOpen className="h-4 w-4" aria-hidden />
        </span>
      )}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold">
          {single ? first.displayName : `${lobby.length} personas`}
        </p>
        <p className="truncate text-xs text-amber-100/80">
          {single ? "quiere unirse a la llamada" : "esperan en la sala de espera · Ver"}
        </p>
      </button>
      {single ? (
        <>
          <button
            type="button"
            onClick={() => onDeny(first.id)}
            aria-label={`Rechazar a ${first.displayName}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80 active:bg-white/20 hover:bg-white/15"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onAdmit(first.id)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-(--call-accent) px-4 text-sm font-semibold text-(--brand-primary-foreground) active:opacity-80 hover:bg-(--call-accent-hover)"
          >
            <Check className="h-4 w-4" /> Admitir
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onAdmitAll}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-(--call-accent) px-4 text-sm font-semibold text-(--brand-primary-foreground) active:opacity-80 hover:bg-(--call-accent-hover)"
        >
          <Check className="h-4 w-4" /> Admitir a todos
        </button>
      )}
    </div>
  );
}
