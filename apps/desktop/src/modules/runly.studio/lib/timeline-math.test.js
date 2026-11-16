import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampZoom, fitZoom, formatClock, formatSeconds, msToPx, pxToMs, rulerTicks, snapTime, timelineEnd } from './timeline-math.js'

test('conversions, zoom limits and fit', () => {
  assert.equal(msToPx(1500, 200), 300); assert.equal(pxToMs(300, 200), 1500)
  assert.equal(clampZoom(5), 20); assert.equal(clampZoom(5000), 1200)
  assert.equal(fitZoom(4000, 824), 200, '4 s across 800 px')
})

test('ruler ticks keep labels apart and include minors', () => {
  const ticks = rulerTicks(4000, 200)
  const majors = ticks.filter(t => t.major).map(t => t.at)
  assert.deepEqual(majors, [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000])
  assert.ok(ticks.length > majors.length)
  assert.deepEqual(rulerTicks(10000, 20).filter(t => t.major).map(t => t.at), [0, 5000, 10000])
})

test('snapping prefers nearby targets, then the grid; disabled keeps whole ms', () => {
  assert.equal(snapTime(1490, { zoom: 200, targets: [1500] }), 1500)
  assert.equal(snapTime(1430, { zoom: 200, targets: [1500] }), 1400, '14 px away: grid')
  assert.equal(snapTime(1437.6, { zoom: 200, enabled: false }), 1438)
  assert.equal(snapTime(-50, { zoom: 200 }), 0)
})

test('visible end covers effects and keyframes beyond the slide; formats', () => {
  assert.equal(timelineEnd(4000, []), 5500)
  assert.equal(timelineEnd(4000, [{ exit: { delay: 5000, duration: 1000 } }, { keyframes: [{ at: 0 }, { at: 6500 }] }]), 8000)
  assert.deepEqual([formatSeconds(1500), formatSeconds(250), formatSeconds(4000)], ['1,5 s', '0,25 s', '4 s'])
  assert.equal(formatClock(61500), '01:01,500')
})
