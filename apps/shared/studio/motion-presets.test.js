import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDocument } from './document.js'
import { EMPHASIS_PRESETS, ENTER_EXIT_PRESETS, SLIDE_TRANSITIONS, sceneAt, transitionAt, validateMotion, validateSlide } from './motion.js'

const page = { id: 'page-1', width: 1000, height: 500, background: '#ffffff', slide: { duration: 6000 } }
const rect = (extra = {}) => ({ id: 'r', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, rotation: 0, fill: '#ff0000', ...extra })
const doc = (...objects) => validateDocument({ schemaVersion: 8, unit: 'px', page, objects, additionalPages: [] })
const at = (document, t) => sceneAt(document, 'page-1', t).objects[0]
const linear = (preset, extra = {}) => ({ preset, duration: 1000, delay: 1000, easing: 'linear', ...extra })

test('every enter/exit preset is valid, starts away from rest and ends exactly at the design', () => {
  for (const preset of ENTER_EXIT_PRESETS) {
    const document = doc(rect({ enter: linear(preset), exit: linear(preset, { delay: 4000 }) })), { enter, exit, ...base } = document.objects[0]
    assert.deepEqual(validateMotion({ enter: linear(preset) }).enter.preset, preset)
    assert.equal(at(document, 999).hidden, true, `${preset} hidden before its delay`)
    assert.deepEqual(at(document, 2000), base, `${preset} at rest after the entry`)
    assert.notDeepEqual(at(document, 1300), base, `${preset} moves during the entry`)
    assert.notDeepEqual(at(document, 4700), base, `${preset} moves during the exit`)
    assert.equal(at(document, 5000).hidden, true, `${preset} hidden after the exit`)
  }
})

test('every emphasis preset is at rest at both ends of each repetition', () => {
  for (const preset of EMPHASIS_PRESETS) {
    const document = doc(rect({ emphasis: { ...linear(preset), repeat: 2 } })), { emphasis, ...base } = document.objects[0]
    for (const t of [1000, 3000]) assert.deepEqual(at(document, t), base, `${preset} at ${t}`)
    assert.notDeepEqual(at(document, 1200), base, `${preset} moves`)
  }
})

test('wipes and reveal clip the visual box without touching the document', () => {
  const right = doc(rect({ enter: linear('wipe-right') }))
  assert.deepEqual(at(right, 1250).clip, { left: 0, top: 0, right: 0.75, bottom: 0 }, 'entry wipe-right opens from the left')
  assert.deepEqual(at(doc(rect({ exit: linear('wipe-right') })), 1250).clip, { left: 0.25, top: 0, right: 0, bottom: 0 }, 'exit wipe-right closes from the left')
  assert.deepEqual(at(doc(rect({ enter: linear('reveal') })), 1500).clip, { left: 0.25, top: 0.25, right: 0.25, bottom: 0.25 })
  assert.equal(at(right, 2000).clip, undefined, 'no clip at rest')
  assert.equal(right.objects[0].clip, undefined)
})

test('fly comes from outside the page; float stays close', () => {
  assert.equal(at(doc(rect({ enter: linear('fly-left') })), 1000).x, 1100)
  assert.equal(at(doc(rect({ enter: linear('float-up') })), 1000).y, 130)
})

test('transitions: new types validate; backwards is the exact reverse with swapped layers', () => {
  for (const type of SLIDE_TRANSITIONS) {
    assert.equal(validateSlide({ transition: { type } }).transition.type, type)
    const forward = transitionAt({ type, duration: 600, easing: 'ease-in-out' }, 0.3), back = transitionAt({ type, duration: 600, easing: 'ease-in-out' }, 0.7, -1)
    assert.deepEqual(back.incoming, forward.outgoing, `${type} incoming`)
    assert.deepEqual(back.outgoing, forward.incoming, `${type} outgoing`)
    assert.notEqual(back.front, forward.front)
    const done = transitionAt({ type, duration: 600, easing: 'linear' }, 1)
    if (type !== 'none') assert.deepEqual({ opacity: done.incoming.opacity, dx: done.incoming.dx + 0, dy: done.incoming.dy + 0, scale: done.incoming.scale }, { opacity: 1, dx: 0, dy: 0, scale: 1 }, `${type} ends at rest`)
  }
  assert.deepEqual(transitionAt({ type: 'wipe-left', duration: 600, easing: 'linear' }, 0.25).incoming.clip, { left: 0.75, top: 0, right: 0, bottom: 0 })
  assert.equal(transitionAt({ type: 'uncover-left', duration: 600, easing: 'linear' }, 0.5).front, 'outgoing')
  assert.deepEqual(transitionAt({ type: 'fade-black', duration: 600, easing: 'linear' }, 0.25).incoming.opacity, 0)
})
