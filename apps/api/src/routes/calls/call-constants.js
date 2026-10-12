export const LIVE_CALL_STATUSES = ["RINGING", "ACTIVE"];
// How long a member's phone rings before the ring counts as missed.
export const RING_TIMEOUT_MS = 36_000;
// How long a participant whose page unloaded (reload, crash, tab closed) keeps
// their place in the call before it counts as leaving.
export const DISCONNECT_GRACE_MS = 90_000;
