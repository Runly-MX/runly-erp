import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendObject, blankDocument, validateDocument } from './document.js'
import { applyOps, checkOps, diffOps } from './operations.js'
import { easing, presentationSequence, projectV7, transitionAt, usesV8, validateMotion, validateSlide } from './motion.js'

const withPages = () => {
  const doc = appendObject(blankDocument(), 'rectangle')
  return validateDocument({ ...doc, additionalPages: [{ page: { id: 'page-2', width: 1080, height: 1080, background: '#000000' }, objects: [] }] })
}
const slide = { duration: 3000, transition: { type: 'fade', duration: 400, easing: 'ease-in-out' } }

test('static documents stay v7; v8 fields upgrade and never downgrade', () => {
  const doc = withPages()
  assert.equal(doc.schemaVersion, 7)
  for (const old of [1, 2, 3, 4, 5, 6]) assert.equal(validateDocument({ ...blankDocument(), schemaVersion: old, additionalPages: undefined }).schemaVersion, 7)
  const v8 = validateDocument({ ...doc, page: { ...doc.page, slide } })
  assert.equal(v8.schemaVersion, 8)
  assert.deepEqual(v8.page.slide, slide)
  const { slide: _, ...plainPage } = v8.page
  assert.equal(validateDocument({ ...v8, page: plainPage }).schemaVersion, 8, 'monotonic once v8')
  assert.equal(validateDocument({ ...doc, schemaVersion: 8 }).schemaVersion, 8)
})

test('slide settings are canonical, bounded and drop unknown keys', () => {
  assert.deepEqual(validateSlide({ transition: { type: 'zoom' }, other: 1 }), { transition: { type: 'zoom', duration: 600, easing: 'ease-out' } })
  for (const bad of [{ duration: 499 }, { duration: 600001 }, { duration: 1.5 }, { transition: { type: 'flip' } }, { transition: { type: 'fade', duration: 3001 } }, { transition: { type: 'fade', easing: 'bounce' } }, []])
    assert.throws(() => validateSlide(bad))
  const doc = withPages()
  assert.throws(() => validateDocument({ ...doc, page: { ...doc.page, slide: { duration: 10 } } }), { code: 'STUDIO_INVALID' })
  assert.equal(validateDocument({ ...doc, page: { ...doc.page, slide: {} } }).page.slide, undefined, 'empty slide is omitted')
})

test('object motion is validated, preserved and bounded without UI', () => {
  const motion = {
    enter: { preset: 'slide-up', duration: 600, delay: 0, easing: 'ease-out' },
    exit: { preset: 'fade', duration: 400, delay: 4000, easing: 'ease-in' },
    emphasis: { preset: 'pulse', duration: 800, delay: 1500, easing: 'ease-in-out', repeat: 2 },
    keyframes: [{ at: 0, x: 80, opacity: 0 }, { at: 1200, x: 400, opacity: 1, easing: 'ease-out' }],
  }
  const doc = withPages()
  const v8 = validateDocument({ ...doc, objects: [{ ...doc.objects[0], ...motion }] })
  assert.equal(v8.schemaVersion, 8)
  assert.deepEqual(validateMotion(v8.objects[0]), motion)
  assert.deepEqual(validateDocument(v8), v8, 'roundtrip keeps every motion field')
  for (const bad of [{ enter: { preset: 'pulse' } }, { emphasis: { preset: 'spin', repeat: 21 } }, { enter: { preset: 'fade', repeat: 2 } },
    { exit: { preset: 'fade', duration: 10001 } }, { keyframes: [{ at: 0, x: 1 }] }, { keyframes: [{ at: 10, x: 1 }, { at: 10, x: 2 }] },
    { keyframes: [{ at: 0 }, { at: 5, x: 1 }] }, { keyframes: [{ at: 0, opacity: 2 }, { at: 5, opacity: 1 }] }])
    assert.throws(() => validateDocument({ ...doc, objects: [{ ...doc.objects[0], ...bad }] }), { code: 'STUDIO_INVALID' }, JSON.stringify(bad))
})

test('operations carry slide and motion keys and concurrent effects converge', () => {
  const doc = withPages()
  const next = validateDocument({ ...doc, page: { ...doc.page, slide } })
  const ops = checkOps(diffOps(doc, next))
  assert.deepEqual(ops, [{ type: 'patchPage', pageId: 'page-1', set: { slide }, unset: [] }])
  assert.deepEqual(validateDocument(applyOps(doc, ops)), next)
  const id = doc.objects[0].id
  const a = { type: 'patch', pageId: 'page-1', id, set: { enter: { preset: 'fade', duration: 600, delay: 0, easing: 'ease-out' } } }
  const b = { type: 'patch', pageId: 'page-1', id, set: { exit: { preset: 'zoom-out', duration: 300, delay: 2000, easing: 'ease-in' } } }
  const merged = validateDocument(applyOps(doc, checkOps([a, b])))
  assert.ok(merged.objects[0].enter && merged.objects[0].exit, 'enter and exit edited by two sessions both survive')
  assert.equal(validateDocument(applyOps(next, [{ type: 'duplicatePage', pageId: 'page-1', newId: 'page-3' }])).additionalPages[0].page.slide.duration, 3000)
  assert.throws(() => checkOps([{ type: 'patchPage', pageId: 'page-1', set: { timeline: {} } }]))
})

test('v7 projection strips v8 fields and reports the loss', () => {
  const doc = withPages()
  assert.deepEqual(projectV7(doc), { document: doc, lost: false })
  const v8 = validateDocument({ ...doc, page: { ...doc.page, slide }, objects: [{ ...doc.objects[0], enter: { preset: 'fade' } }] })
  const { document, lost } = projectV7(v8)
  assert.equal(lost, true)
  assert.equal(usesV8(document), false)
  assert.deepEqual(validateDocument(document), doc)
})

test('easing and transitions are deterministic at the boundaries', () => {
  for (const name of ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']) {
    assert.equal(easing(name, 0), 0); assert.equal(easing(name, 1), 1)
    assert.equal(easing(name, 0.5), easing(name, 0.5))
  }
  assert.equal(easing('linear', 0.25), 0.25)
  assert.ok(Math.abs(easing('ease-in-out', 0.5) - 0.5) < 1e-9)
  assert.ok(easing('ease-out', 0.3) > 0.3 && easing('ease-in', 0.3) < 0.3)
  const left = { type: 'slide-left', duration: 500, easing: 'linear' }
  assert.deepEqual(transitionAt(left, 0).incoming, { opacity: 1, dx: 1, dy: 0, scale: 1 })
  assert.deepEqual(transitionAt(left, 1).outgoing, { opacity: 1, dx: -1, dy: -0, scale: 1 })
  assert.equal(transitionAt(left, 0, -1).incoming.dx, -1, 'backwards navigation mirrors the slide')
  assert.equal(transitionAt({ type: 'fade', duration: 400, easing: 'linear' }, 0.5).incoming.opacity, 0.5)
  assert.equal(transitionAt({ type: 'zoom', duration: 400, easing: 'linear' }, 0).incoming.scale, 0.85)
  assert.equal(transitionAt(undefined, 0).incoming.opacity, 1)
})

test('presentation sequence uses defaults and page order', () => {
  const doc = withPages()
  const next = validateDocument({ ...doc, additionalPages: [{ ...doc.additionalPages[0], page: { ...doc.additionalPages[0].page, slide } }] })
  assert.deepEqual(presentationSequence(next).map(({ pageId, duration, transition }) => [pageId, duration, transition.type]), [['page-1', 5000, 'none'], ['page-2', 3000, 'fade']])
})
