import { useMemo, useState } from "react";
import {
  cn, Input, ConfirmDialog,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@runly/ui";
import { Check, Hand, Link2, MicOff, MoreVertical, Phone, PhoneCall, Pin, PinOff, Search, UserPlus, UserX, X } from "lucide-react";
import { CallAvatar } from "../ui/CallAvatar";

function SectionTitle({ children, count, action }) {
  return (
    <div className="flex items-center gap-2 px-1 pb-1.5 pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{children}</h3>
      {count != null && <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-semibold text-white/70">{count}</span>}
      <div className="ml-auto">{action}</div>
    </div>
  );
}

function PersonRow({ avatar, name, subtitle, trailing, highlight = false }) {
  return (
    <li className={cn("flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.04]", highlight && "bg-amber-400/[0.07]")}>
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{name}</p>
        {subtitle && <p className="truncate text-xs text-white/50">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">{trailing}</div>
    </li>
  );
}

function matches(query, name) {
  if (!query) return true;
  return name.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"));
}

// The meeting roster (Teams/Meet "Personas"): lobby, who's in, who's missing.
export function CallPeoplePanel({
  roster, isHost, myIdentity, raisedHands, speakingIds, pinnedIdentity,
  onAdmit, onDeny, onAdmitAll, onRing, ringingIds = new Set(),
  onMute, onRemove, onPin, onInvite, onCopyLink,
}) {
  const [query, setQuery] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const lobby = useMemo(() => roster.lobby.filter((g) => matches(query, g.displayName ?? "")), [roster.lobby, query]);
  const inCall = useMemo(() => roster.inCall.filter((p) => matches(query, p.name)), [roster.inCall, query]);
  const notJoined = useMemo(() => roster.notJoined.filter((p) => matches(query, p.name)), [roster.notJoined, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pb-1 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar personas"
            aria-label="Buscar personas"
            className="h-10 rounded-xl border-white/10 bg-white/[0.05] pl-9 text-white placeholder:text-white/40"
          />
        </div>
      </div>

      <div className="call-scroll-y min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isHost && lobby.length > 0 && (
          <section aria-label="Sala de espera">
            <SectionTitle
              count={lobby.length}
              action={lobby.length > 1 && (
                <button type="button" onClick={onAdmitAll} className="rounded-lg px-2 py-1 text-xs font-semibold text-(--call-accent) hover:bg-white/5">
                  Admitir a todos
                </button>
              )}
            >
              Sala de espera
            </SectionTitle>
            <ul className="space-y-0.5">
              {lobby.map((guest) => (
                <PersonRow
                  key={guest.id}
                  highlight
                  avatar={<CallAvatar name={guest.displayName} seed={guest.id} size="sm" />}
                  name={guest.displayName}
                  subtitle={guest.email || "Invitado externo"}
                  trailing={(
                    <>
                      <button type="button" onClick={() => onAdmit(guest.id)} className="flex h-9 items-center gap-1 rounded-lg bg-(--call-accent) px-3 text-xs font-semibold text-(--brand-primary-foreground) hover:bg-(--call-accent-hover)">
                        <Check className="h-3.5 w-3.5" /> Admitir
                      </button>
                      <button type="button" onClick={() => onDeny(guest.id)} aria-label={`Rechazar a ${guest.displayName}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-red-300">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                />
              ))}
            </ul>
          </section>
        )}

        <section aria-label="En la llamada">
          <SectionTitle count={inCall.length}>En la llamada</SectionTitle>
          {onPin && (
            <p className="px-1 pb-1.5 text-[11px] text-white/45">Fijar a alguien lo deja en grande solo en tu pantalla.</p>
          )}
          <ul className="space-y-0.5">
            {inCall.map((person) => {
              const isMe = person.identity === myIdentity;
              const hand = raisedHands?.has(person.identity);
              const speaking = speakingIds?.has(person.identity);
              const micOff = person.participant && !person.participant.isMicrophoneEnabled;
              const canModerate = isHost && !isMe && person.role !== "host";
              const subtitle = [
                isMe ? "Tú" : null,
                person.role === "host" ? "Anfitrión" : person.role === "guest" ? "Invitado" : null,
                speaking ? "Hablando" : null,
              ].filter(Boolean).join(" · ");
              return (
                <PersonRow
                  key={person.identity}
                  avatar={<CallAvatar name={person.name} seed={person.identity} url={person.avatarUrl} size="sm" speaking={speaking} />}
                  name={person.name}
                  subtitle={subtitle || null}
                  trailing={(
                    <>
                      {hand && <Hand className="h-4 w-4 text-(--call-hand)" aria-label="Mano levantada" />}
                      {micOff && <MicOff className="h-4 w-4 text-white/40" aria-label="Micrófono apagado" />}
                      {onPin && (
                        <button
                          type="button"
                          onClick={() => onPin(person.identity)}
                          aria-pressed={pinnedIdentity === person.identity}
                          aria-label={pinnedIdentity === person.identity ? `Dejar de fijar a ${person.name}` : `Fijar a ${person.name} en tu pantalla`}
                          title={pinnedIdentity === person.identity ? "Dejar de fijar" : "Fijar en tu pantalla (solo para ti)"}
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                            pinnedIdentity === person.identity
                              ? "bg-(--call-accent) text-(--brand-primary-foreground)"
                              : "text-white/60 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          {pinnedIdentity === person.identity ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        </button>
                      )}
                      {canModerate && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" aria-label={`Opciones de ${person.name}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="call-dialog z-10010 w-52">
                            {!micOff && (
                              <DropdownMenuItem onSelect={() => onMute(person)}>
                                <MicOff className="mr-2 h-4 w-4" /> Silenciar
                              </DropdownMenuItem>
                            )}
                            {(
                              <>
                                {!micOff && <DropdownMenuSeparator />}
                                <DropdownMenuItem className="text-red-400 focus:text-red-400" onSelect={() => setConfirmRemove(person)}>
                                  <UserX className="mr-2 h-4 w-4" /> Quitar de la llamada
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </>
                  )}
                />
              );
            })}
          </ul>
        </section>

        {notJoined.length > 0 && (
          <section aria-label="Aún no se unen">
            <SectionTitle count={notJoined.length}>Aún no se unen</SectionTitle>
            <ul className="space-y-0.5">
              {notJoined.map((person) => {
                const ringing = ringingIds.has(person.identity);
                return (
                  <PersonRow
                    key={person.identity}
                    avatar={<CallAvatar name={person.name} seed={person.identity} url={person.avatarUrl} size="sm" className="opacity-70" />}
                    name={person.name}
                    subtitle={ringing ? "Sonando…" : "Miembro del canal"}
                    trailing={onRing && (
                      <button
                        type="button"
                        onClick={() => onRing(person.identity)}
                        disabled={ringing}
                        className={cn(
                          "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors",
                          ringing ? "bg-emerald-400/15 text-emerald-200" : "bg-white/[0.08] text-white hover:bg-white/15",
                        )}
                      >
                        {ringing ? <PhoneCall className="h-3.5 w-3.5 animate-pulse" /> : <Phone className="h-3.5 w-3.5" />}
                        {ringing ? "Sonando" : "Llamar"}
                      </button>
                    )}
                  />
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {(onInvite || onCopyLink) && (
        <div className="flex shrink-0 gap-2 border-t border-white/10 p-3" style={{ paddingBottom: "calc(0.75rem + var(--sab))" }}>
          {onInvite && (
            <button type="button" onClick={onInvite} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-(--call-accent) text-sm font-semibold text-(--brand-primary-foreground) hover:bg-(--call-accent-hover)">
              <UserPlus className="h-4 w-4" /> Invitar personas
            </button>
          )}
          {onCopyLink && (
            <button type="button" onClick={onCopyLink} aria-label="Copiar enlace de la reunión" title="Copiar enlace" className="flex min-h-11 w-11 items-center justify-center rounded-xl bg-white/[0.08] text-white hover:bg-white/15">
              <Link2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmRemove)}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title="Quitar de la llamada"
        description={confirmRemove ? `${confirmRemove.name} saldrá de la llamada y no podrá volver a entrar a esta reunión.` : ""}
        confirmLabel="Quitar"
        variant="destructive"
        onConfirm={() => { onRemove(confirmRemove); setConfirmRemove(null); }}
      />
    </div>
  );
}
