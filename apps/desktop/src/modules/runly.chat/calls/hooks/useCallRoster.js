import { useMemo } from "react";
import { isGuestIdentity, isScreenIdentity } from "../ui/callTheme";

function memberAvatar(member) {
  return member?.avatarUrl || member?.authAvatarUrl || null;
}

// Joins the three sources of "who is in this call":
//  - LiveKit participants (who is actually connected),
//  - conversation members (names/avatars, and who could still join),
//  - the host's guest roster (lobby + admitted guests, with ids to moderate).
// Returns an identity -> info map for tiles, plus the people-panel lists.
// MirAI (is_bot) is never listed as a person.
export function useCallRoster({ participants, members = [], guests = [], initiatorId, raisedHands, speakingIds }) {
  return useMemo(() => {
    const memberById = new Map();
    for (const member of members) {
      if (member?.userId && !member.leftAt && !member.isBot) memberById.set(member.userId, member);
    }
    const guestByIdentity = new Map();
    for (const guest of guests) {
      if (guest?.livekitIdentity) guestByIdentity.set(guest.livekitIdentity, guest);
    }

    const infoByIdentity = new Map();
    const inCall = [];
    for (const entry of participants) {
      const identity = entry.participant?.identity;
      if (!identity || isScreenIdentity(identity)) continue;
      const member = memberById.get(identity);
      const guest = guestByIdentity.get(identity);
      const role = identity === initiatorId ? "host" : isGuestIdentity(identity) ? "guest" : null;
      const info = {
        identity,
        name: member?.displayName || guest?.displayName || entry.participant?.name || "Participante",
        avatarUrl: memberAvatar(member),
        role,
        isLocal: entry.isLocal,
        guestId: guest?.id ?? null,
        isMember: Boolean(member),
      };
      infoByIdentity.set(identity, info);
      inCall.push({ ...info, participant: entry.participant });
    }

    // Raised hands first (in raise order), then whoever is speaking, then the
    // host, then by name — the order people expect in a meeting roster.
    const handOrder = new Map([...(raisedHands?.entries?.() ?? [])].map(([id, v], i) => [id, v?.at ?? i]));
    inCall.sort((a, b) => {
      const ha = handOrder.has(a.identity) ? handOrder.get(a.identity) : Infinity;
      const hb = handOrder.has(b.identity) ? handOrder.get(b.identity) : Infinity;
      if (ha !== hb) return ha - hb;
      const sa = speakingIds?.has(a.identity) ? 0 : 1;
      const sb = speakingIds?.has(b.identity) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      if (a.role === "host" && b.role !== "host") return -1;
      if (b.role === "host" && a.role !== "host") return 1;
      return a.name.localeCompare(b.name, "es");
    });

    const inCallIds = new Set(inCall.map((p) => p.identity));
    const notJoined = [...memberById.values()]
      .filter((m) => !inCallIds.has(m.userId))
      .map((m) => ({ identity: m.userId, name: m.displayName || "Miembro", avatarUrl: memberAvatar(m) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    const lobby = guests.filter((g) => g.status === "LOBBY");
    return { infoByIdentity, inCall, notJoined, lobby };
  }, [participants, members, guests, initiatorId, raisedHands, speakingIds]);
}
