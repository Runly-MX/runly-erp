import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertExecuted } from '../lib/node-test-summary.mjs'

const summary = (pass, fail, skipped, cancelled = 0) => `# pass ${pass}\n# fail ${fail}\n# cancelled ${cancelled}\n# skipped ${skipped}\n`
test('assertExecuted accepts a real pass and rejects skips, failures and a missing summary', () => {
  assert.equal(assertExecuted(summary(1, 0, 0)).pass, 1)
  assert.throws(() => assertExecuted(summary(0, 0, 1)), /skipped/)
  assert.throws(() => assertExecuted(summary(0, 1, 0)), /failed/)
  assert.throws(() => assertExecuted('no summary'), /no summary/)
  assert.throws(() => assertExecuted(summary(0, 0, 0)), /expected at least/)
})
