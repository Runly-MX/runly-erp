import { getApiUrl } from "../../../lib/runtimeConfig";

// soft: the server keeps our place for a grace period, so a reload (or a
// browser that killed the tab) resumes the call instead of ending it.
export function leaveCallOnPageHide(callId, token) {
  fetch(`${getApiUrl()}/calls/${encodeURIComponent(callId)}/leave`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ soft: true }),
    keepalive: true,
  }).catch(() => {});
}
