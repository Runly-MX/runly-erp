import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForApproval, approvalWaitMs } from '../approval-wait.js';

const auth = { authUserId: 'user-a', grantId: 'grant-a' };
const sequence = payloads => { let i = 0; return async () => ({ payload: payloads[Math.min(i++, payloads.length - 1)] }); };
const pending = { ...auth, approved: false, rejected: false };

test('waits until the person approves in Runly, then lets the commit run', async () => {
  const waits = [];
  const outcome = await waitForApproval(sequence([pending, pending, { ...pending, approved: true }]), 'p', auth, { waitMs: 10000, pollMs: 100, wait: async ms => waits.push(ms) });
  assert.equal(outcome, 'approved');
  assert.deepEqual(waits, [100, 100]);
});

test('returns at once on rejection, completion or a foreign proposal', async () => {
  const fast = { waitMs: 10000, pollMs: 100, wait: async () => assert.fail('must not wait') };
  assert.equal(await waitForApproval(sequence([{ ...pending, rejected: true }]), 'p', auth, fast), 'rejected');
  assert.equal(await waitForApproval(sequence([{ ...pending, approved: true, result: {} }]), 'p', auth, fast), 'completed');
  assert.equal(await waitForApproval(sequence([{ ...pending, grantId: 'other' }]), 'p', auth, fast), 'foreign');
  assert.equal(await waitForApproval(async () => null, 'p', auth, fast), 'foreign');
});

test('gives up as pending at the deadline and honors a disabled wait', async () => {
  assert.equal(await waitForApproval(sequence([pending]), 'p', auth, { waitMs: 50, pollMs: 100, wait: async () => assert.fail('past deadline') }), 'pending');
  assert.equal(await waitForApproval(sequence([pending]), 'p', auth, { waitMs: 0 }), 'skipped');
  assert.equal(approvalWaitMs({}), 45000);
  assert.equal(approvalWaitMs({ RUNLY_MCP_APPROVAL_WAIT_SECONDS: '' }), 45000);
  assert.equal(approvalWaitMs({ RUNLY_MCP_APPROVAL_WAIT_SECONDS: '0' }), 0);
  assert.equal(approvalWaitMs({ RUNLY_MCP_APPROVAL_WAIT_SECONDS: '600' }), 60000);
});
