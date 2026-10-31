// Retry policy of company automations (spec
// docs/superpowers/specs/2026-10-31-automations-retries-loops-date-triggers-design.md §A):
// a run that stopped at a failed step resumes from that step later when the error
// can heal by itself, or is parked so a person can resume it.

// Minutes before each automatic retry; its length is the number of retries.
export const RETRY_DELAYS_MIN = Object.freeze([1, 5, 15, 60, 60]);
export const MAX_RETRIES = RETRY_DELAYS_MIN.length;

// A step error worth retrying: the other side was down, busy or slow. Errors with a
// 4xx status (permission, invalid data, not found) fail the same way every time.
export function isTransient(entry) {
  const status = Number(entry?.status) || null;
  if (!status) return true;
  return status >= 500 || status === 429 || status === 408;
}

// What to do with a run that stopped at `stoppedAt`. `attempt` counts the retries
// already made (0 on the first run).
export function planRetry({ result, attempt = 0, enabled = true, now = new Date() }) {
  const failedStep = result.steps.find((step) => step.index === result.stoppedAt);
  if (!enabled || attempt >= MAX_RETRIES || !isTransient(failedStep)) return { status: "failed", attempt };
  return { status: "retrying", attempt: attempt + 1, at: new Date(now.getTime() + RETRY_DELAYS_MIN[attempt] * 60_000) };
}
