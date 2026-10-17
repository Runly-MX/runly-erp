const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// A stateless server cannot tell the client that the person approved in Runly.
// Instead, a commit called while its proposal is pending waits briefly for the
// web decision, so the assistant can finish without another chat message.
// It never approves anything: the commit re-validates as usual afterwards.
// Proposals of another user/connection return immediately so the commit
// reports its usual error without leaking timing.
export async function waitForApproval(getProposal, id, auth, { waitMs = 45000, pollMs = 1500, wait = sleep } = {}) {
  if (!id || waitMs <= 0) return 'skipped';
  const deadline = Date.now() + waitMs;
  for (;;) {
    const p = (await getProposal(id))?.payload;
    if (!p || p.authUserId !== auth.authUserId || p.grantId !== auth.grantId) return 'foreign';
    if (p.result) return 'completed';
    if (p.rejected) return 'rejected';
    if (p.approved) return 'approved';
    if (Date.now() + pollMs > deadline) return 'pending';
    await wait(pollMs);
  }
}

export function approvalWaitMs(env = process.env) {
  const raw = String(env.RUNLY_MCP_APPROVAL_WAIT_SECONDS ?? '').trim();
  const seconds = raw === '' ? 45 : Number(raw);
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), 60) * 1000 : 45000;
}
