export const ACTIVE_CALL_SESSION_KEY = "atlas-active-call-id";

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function getClaimedCallId(storage) {
  try {
    return resolveStorage(storage)?.getItem(ACTIVE_CALL_SESSION_KEY) ?? null;
  } catch {
    return null;
  }
}

export function claimCallForDevice(callId, storage) {
  if (!callId) return false;
  try {
    resolveStorage(storage)?.setItem(ACTIVE_CALL_SESSION_KEY, callId);
    return true;
  } catch {
    return false;
  }
}

// The client-only meeting mode ("inperson") of the claimed call, so a page
// reload resumes the same view. Per tab, like the claim itself.
export const ACTIVE_CALL_MODE_KEY = "atlas-active-call-mode";

export function rememberCallMeetingMode(callId, meetingMode, storage) {
  try {
    const target = resolveStorage(storage);
    if (!callId || !meetingMode) target?.removeItem(ACTIVE_CALL_MODE_KEY);
    else target?.setItem(ACTIVE_CALL_MODE_KEY, JSON.stringify({ callId, meetingMode }));
  } catch { /* storage disabled — a reload just opens the regular view */ }
}

export function getRememberedMeetingMode(callId, storage) {
  try {
    const saved = JSON.parse(resolveStorage(storage)?.getItem(ACTIVE_CALL_MODE_KEY) || "null");
    return saved?.callId === callId ? saved.meetingMode ?? null : null;
  } catch {
    return null;
  }
}

export function releaseCallForDevice(callId, storage) {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    if (!callId || target.getItem(ACTIVE_CALL_SESSION_KEY) === callId) {
      target.removeItem(ACTIVE_CALL_SESSION_KEY);
      target.removeItem(ACTIVE_CALL_MODE_KEY);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function shouldResumeCallOnDevice(callId, participantStatus, storage) {
  return participantStatus === "JOINED" && getClaimedCallId(storage) === callId;
}
