import { Loader2, MessageSquarePlus } from "lucide-react";
import { AvatarCircle } from "./AvatarCircle";

const STRIP_LIMIT = 20;

// The company's people at the top of the chat list, online first: the obvious
// way for someone new to see who is here and who is connected, and to open a
// 1:1 chat with a single tap.
export function PeopleStrip({ people, onlineCount, startingId, onStart, onSeeAll }) {
  if (!people.length) return null;
  const visible = people.slice(0, STRIP_LIMIT);
  return (
    <section aria-label="Personas de tu empresa" className="pb-1.5">
      <div className="flex items-center gap-2 px-2 pb-1 pt-0.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Personas</h3>
        {onlineCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-[hsl(var(--muted-foreground))]">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
            {onlineCount} en línea
          </span>
        )}
        <button
          type="button"
          onClick={onSeeAll}
          className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 [@media(pointer:coarse)]:min-h-9"
        >
          Ver todas
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto overscroll-x-contain px-1 pb-1" style={{ scrollbarWidth: "none" }}>
        {visible.map((person) => {
          const firstName = person.displayName?.split(" ")[0] ?? person.email;
          return (
            <button
              key={person.id}
              type="button"
              title={`Chatear con ${person.displayName ?? person.email}${person.online ? " (en línea)" : ""}`}
              aria-label={`Chatear con ${person.displayName ?? person.email}`}
              onClick={() => onStart(person)}
              disabled={Boolean(startingId)}
              className="flex w-15 shrink-0 flex-col items-center gap-1 rounded-md p-1.5 transition-colors hover:bg-[hsl(var(--muted))] disabled:opacity-60"
            >
              <span className="relative">
                <AvatarCircle name={person.displayName} avatarUrl={person.avatarUrl} online={person.online} />
                {startingId === person.id && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-[11px]">{firstName}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// People matching the sidebar search, so typing a coworker's name finds them
// even before there is any conversation with them.
export function PeopleSearchResults({ people, search, startingId, onStart }) {
  const q = search.trim().toLowerCase();
  const matches = q
    ? people.filter((p) => p.displayName?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)).slice(0, 6)
    : [];
  if (!matches.length) return null;
  return (
    <section aria-label="Personas" className="pb-2">
      <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Personas</h3>
      {matches.map((person) => (
        <button
          key={person.id}
          type="button"
          onClick={() => onStart(person)}
          disabled={Boolean(startingId)}
          className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[hsl(var(--muted))] disabled:opacity-60"
        >
          <AvatarCircle name={person.displayName} avatarUrl={person.avatarUrl} online={person.online} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{person.displayName ?? person.email}</span>
            <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{person.online ? "En línea" : person.email}</span>
          </span>
          {startingId === person.id
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[hsl(var(--muted-foreground))]" />
            : <MessageSquarePlus className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />}
        </button>
      ))}
    </section>
  );
}
