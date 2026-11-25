// A node:test file that skips itself still exits 0. Gated integration runners use this to fail instead.
export function assertExecuted(output, { minPass = 1 } = {}) {
  const read = (key) => Number(new RegExp(`^# ${key} ([0-9]+)`, 'm').exec(output)?.[1] ?? NaN)
  const [pass, fail, skipped, cancelled] = ['pass', 'fail', 'skipped', 'cancelled'].map(read)
  if ([pass, fail, skipped, cancelled].some(Number.isNaN)) throw new Error('node:test printed no summary; treating the run as failed')
  if (fail || cancelled) throw new Error(`${fail} failed, ${cancelled} cancelled`)
  if (skipped) throw new Error(`${skipped} test(s) skipped: the gate variable did not take effect`)
  if (pass < minPass) throw new Error(`only ${pass} passed, expected at least ${minPass}`)
  return { pass }
}
