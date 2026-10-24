import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { buildAndroidLayoutFixture, fixtureCSS } from './helpers/android-layout-fixture.mjs'

test('shell, notes and floating chat clear Android; attachments support batches and larger mosaics', { timeout: 60000 }, async () => {
  const { code, css } = await buildAndroidLayoutFixture()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true })
    page.setDefaultTimeout(5000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.addStyleTag({ content: css + fixtureCSS })
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--native-inset-top', '24px')
      document.documentElement.style.setProperty('--native-inset-bottom', '56px')
    })
    await page.addScriptTag({ content: code })
    await page.locator('#brand').waitFor()
    const rect = id => page.locator(id).evaluate(el => el.getBoundingClientRect().toJSON())
    const verify = async bottom => {
      assert.equal((await rect('#brand')).bottom, bottom)
      assert.equal((await rect('#format')).bottom, (await rect('#brand')).top)
      assert.ok((await rect('#mini')).bottom <= bottom - 16)
      assert.ok((await rect('#bubble')).bottom <= bottom - 16)
      assert.equal((await rect('#sidebar-probe aside')).bottom, bottom, 'sidebar controls also clear system navigation')
    }
    await verify(744)
    await page.evaluate(() => document.documentElement.style.setProperty('--native-inset-bottom', '96px'))
    await page.waitForFunction(() => document.querySelector('#bubble').getBoundingClientRect().bottom <= 688)
    await verify(704)
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: 480 })
      visualViewport.dispatchEvent(new Event('resize'))
    })
    await page.locator('#brand').waitFor({ state: 'detached' })
    assert.equal((await rect('#format')).bottom, 480)
    assert.equal((await rect('.fixture-shell')).bottom, 480)
    assert.ok((await rect('#mini')).bottom <= 464)
    assert.ok((await rect('#bubble')).bottom <= 464)
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: 800 })
      visualViewport.dispatchEvent(new Event('resize'))
    })
    await page.locator('#brand').waitFor()
    await verify(704)

    await page.getByRole('button', { name: 'Abrir subpáginas' }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('button', { name: 'Ideas' }).click()
    assert.deepEqual(await page.evaluate(() => window.opened), ['child'])
    await page.getByRole('dialog').waitFor({ state: 'hidden' })

    await page.locator('#attach').click()
    const chooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Galería' }).click()
    const chooser = await chooserPromise
    assert.equal(chooser.isMultiple(), true)
    // Native focus may close the popover while the picker is active.
    await page.keyboard.press('Escape')
    await chooser.setFiles([
      { name: 'uno.png', mimeType: 'image/png', buffer: Buffer.from('one') },
      { name: 'dos.png', mimeType: 'image/png', buffer: Buffer.from('two') },
    ])
    assert.deepEqual(await page.evaluate(() => window.picked), [['uno.png', 'dos.png']])
    await page.locator('#attach').click()
    const cameraPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Cámara' }).click()
    const camera = await cameraPromise
    assert.equal(camera.isMultiple(), false)
    assert.equal(await camera.element().getAttribute('capture'), 'environment')
    await camera.setFiles([])

    for (const count of [2, 3, 4, 6]) {
      await page.evaluate(count => window.setImageCount(count), count)
      await page.waitForFunction(count => document.querySelectorAll('#media [data-attachment-id]').length === Math.min(count, 4), count)
      const media = await rect('#media > div')
      assert.equal(media.width, 352)
      assert.ok(media.height >= 218, `album of ${count} uses vertical space`)
      if (count === 6) assert.equal(await page.getByText('+2', { exact: true }).count(), 1)
    }
    await page.setViewportSize({ width: 375, height: 800 })
    await page.locator('#mini').evaluate(el => el.remove())
    assert.ok((await rect('#media > div')).right <= 375)
    assert.equal((await rect('#sidebar-probe aside')).bottom, 704, 'fixed mobile sidebar clears Android too')
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
