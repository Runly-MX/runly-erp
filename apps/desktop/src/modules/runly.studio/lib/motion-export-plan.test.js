import { test } from 'node:test'
import assert from 'node:assert/strict'
import { frameTime, letterbox, locate, planMotionExport } from './motion-export-plan.js'

const pages = [
  { id: 'p1', width: 1920, height: 1080, slide: { duration: 3000 } },
  { id: 'p2', width: 1080, height: 1080, slide: { duration: 2000, transition: { type: 'fade', duration: 500, easing: 'linear' } } },
  { id: 'p3', width: 1920, height: 1080 },
]

test('size follows the first page with even sides; frames and duration add up', () => {
  const plan = planMotionExport(pages, { type: 'mp4', side: 1280, fps: 30 })
  assert.deepEqual([plan.width, plan.height, plan.duration, plan.frames], [1280, 720, 10000, 300])
  assert.deepEqual(plan.segments.map(s => [s.pageId, s.start, s.duration]), [['p1', 0, 3000], ['p2', 3000, 2000], ['p3', 5000, 5000]])
  assert.deepEqual(plan.segments[1].box, { x: 280, y: 0, width: 720, height: 720 }, 'square page letterboxed')
  assert.equal(plan.bitrate, Math.round(1280 * 720 * 30 * 0.08))
  const odd = planMotionExport([{ id: 'x', width: 1001, height: 333 }], { type: 'webm', side: 640, fps: 24 })
  assert.equal(odd.width % 2, 0); assert.equal(odd.height % 2, 0)
  const gif = planMotionExport(pages.slice(0, 2), { type: 'gif', side: 480, fps: 10, loop: false })
  assert.deepEqual([gif.width, gif.height, gif.frames, gif.loop, gif.bitrate], [480, 270, 50, false, null])
})

test('limits and invalid options are reported before rendering', () => {
  assert.match(planMotionExport([...pages, { id: 'p4', width: 100, height: 100, slide: { duration: 15000 } }], { type: 'gif', side: 640, fps: 12 }).error, /El GIF admite como máximo 20 s; esta selección dura 25 s/)
  assert.ok(!planMotionExport(pages, { type: 'gif', side: 640, fps: 12 }).error, '10 s fits a GIF')
  assert.match(planMotionExport([{ id: 'a', width: 100, height: 100, slide: { duration: 600000 } }], { type: 'mp4', side: 1280, fps: 30 }).error, /como máximo 120 s/)
  assert.match(planMotionExport(pages, { type: 'mp4', side: 1000, fps: 30 }).error, /no válidos/)
  assert.match(planMotionExport([], { type: 'webm' }).error, /al menos una página/)
})

test('frame clock and location: transitions run at the start of the incoming page', () => {
  const plan = planMotionExport(pages, { type: 'mp4', side: 1280, fps: 30 })
  assert.equal(frameTime(plan, 90), 3000)
  assert.deepEqual(locate(plan, 2999), { index: 0, local: 2999, transition: null })
  const entering = locate(plan, 3250)
  assert.deepEqual([entering.index, entering.local, entering.transition.progress], [1, 250, 0.5])
  assert.equal(locate(plan, 3500).transition, null, 'transition over')
  assert.deepEqual(locate(plan, 5000), { index: 2, local: 0, transition: null }, 'no transition declared')
  assert.equal(locate(plan, 99999).index, 2, 'clamped to the end')
  assert.deepEqual(letterbox({ width: 100, height: 200 }, 400, 200), { x: 150, y: 0, width: 100, height: 200 })
})
