import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { noteToolbarPlacement, NOTE_TOUCH_BAR_HEIGHT } from '../../apps/desktop/src/modules/runly.notes/lib/noteToolbarPlacement.js'
import { computeKeyboardInset, isKeyboardOpen } from '../../packages/ui/src/lib/keyboardInset.js'

test('touch toolbar stays above Android navigation through keyboard transitions', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.setContent(`<!doctype html><style>
      body{margin:0;--sab:56px;--sal:0px;--sar:0px}
      #toolbar{position:fixed;left:var(--sal);right:var(--sar);height:${NOTE_TOUCH_BAR_HEIGHT}px}
      #android{position:fixed;bottom:0;left:0;right:0;height:var(--sab)}
      #scroll{height:800px;overflow:auto;box-sizing:border-box}
      </style><div id="scroll"></div><div id="toolbar">Herramientas de nota</div><div id="android"></div>`)
    const apply = async (height, offset = 0) => {
      const inset = computeKeyboardInset(800, height, offset)
      const placement = noteToolbarPlacement({ coarse: true, viewing: false,
        keyboard: { inset, open: isKeyboardOpen(800, height) } })
      await page.evaluate(({ placement, barHeight }) => {
        const toolbar = document.querySelector('#toolbar')
        toolbar.style.display = placement.barVisible ? 'block' : 'none'
        toolbar.style.bottom = placement.barBottom
        document.querySelector('#scroll').style.paddingBottom = `calc(${barHeight}px + ${placement.barBottom})`
      }, { placement, barHeight: NOTE_TOUCH_BAR_HEIGHT })
      const boxes = await page.evaluate(() => ({
        toolbar: document.querySelector('#toolbar').getBoundingClientRect().toJSON(),
        android: document.querySelector('#android').getBoundingClientRect().toJSON(),
        padding: parseFloat(getComputedStyle(document.querySelector('#scroll')).paddingBottom),
      }))
      assert.equal(placement.barVisible, true)
      assert.ok(boxes.toolbar.bottom <= boxes.android.top, 'Android must not cover toolbar buttons')
      return { ...boxes, placement }
    }
    const closed = await apply(800)
    assert.equal(closed.toolbar.bottom, 744)
    assert.equal(closed.padding, 104)
    const open = await apply(480)
    assert.equal(open.toolbar.bottom, 480, 'toolbar sits directly above the keyboard')
    assert.equal(open.padding, 368)
    const handwriting = await apply(700)
    assert.equal(handwriting.placement.keyboardInset, 0, 'short handwriting strip is not a full keyboard')
    assert.equal(handwriting.toolbar.bottom, 700, 'short IME strips still cannot cover the toolbar')
    const hidden = await apply(792)
    assert.equal(hidden.toolbar.bottom, 744, 'hide returns toolbar above Android, not behind it')
    await page.evaluate(() => document.body.style.setProperty('--sab', '96px'))
    const taskbar = await apply(800)
    assert.equal(taskbar.toolbar.bottom, 704, 'larger Samsung taskbar updates the CSS clearance')
    assert.equal(taskbar.padding, 144)
    await page.setViewportSize({ width: 412, height: 800 })
    assert.equal((await apply(800)).toolbar.bottom, 704, 'phone layout has the same safe-area contract')
  } finally {
    await browser.close()
  }
})

test('mouse keeps the top toolbar and read-only notes hide editing controls', () => {
  assert.equal(noteToolbarPlacement({ coarse: false, viewing: false, keyboard: { inset: 0, open: false } }).barVisible, false)
  assert.equal(noteToolbarPlacement({ coarse: true, viewing: true, keyboard: { inset: 320, open: true } }).barVisible, false)
})
