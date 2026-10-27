// Requires the identity-checked, disposable local stack owned by the v7 runner.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { blankDocument, appendObject } from '../../../apps/shared/studio/document.js'
const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url))
const { PDFDocument, PDFName } = require('pdf-lib')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function verifyStudioTextMultipage(stack, { users, companies }) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id, stack.name)
  const [owner, , peer] = users, [company] = companies, contexts = [], outputs = []
  const login = async user => {
    const r = await fetch(stack.urls.api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: user.email, password: user.password }) })
    assert.equal(r.status, 200); return (await r.json()).data.access_token
  }
  const token = await login(owner)
  const api = async (path, data) => {
    const response = await fetch(stack.urls.api + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': company.id, 'X-Runly-Studio-Protocol': '3', ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined })
    const result = await response.json(); assert.ok(response.ok, `${response.status}: ${JSON.stringify(result)}`); return result.data
  }
  const scenes = Array.from({ length: 16 }, (_, index) => {
    let scene = appendObject(blankDocument(index % 2 ? 240 : 320, index % 2 ? 320 : 240), 'text', {
      id: `text-${index}`, text: `Página ${index + 1}\nTexto de API\nAltura canónica`, x: 12, y: 16, width: 200, height: [12, 175, 65, 210][index % 4], fontSize: 17,
      fontFamily: index % 2 ? 'Lato' : 'Roboto', fontVariant: index % 2 ? 'bold' : 'regular', textAlign: index % 2 ? 'justify' : 'center', lineHeight: index % 2 ? 1.6 : 1.1,
    })
    scene = appendObject(scene, 'rectangle', { id: `gradient-${index}`, x: 12, y: 165, width: 100, height: 50, fillPaint: { type: 'gradient', gradientType: 'linear', angle: 35, stops: [{ offset: 0, color: '#00ff00', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 1 }] } })
    return { page: { ...scene.page, id: index ? `p${index + 1}` : 'page-1' }, objects: scene.objects }
  })
  const document = { schemaVersion: 7, unit: 'px', ...scenes[0], additionalPages: scenes.slice(1) }
  const made = await api('/studio/designs', { name: 'Synthetic v7 canonical text', document }), root = `/studio/designs/${made.id}`
  const shared = await fetch(stack.urls.api + root + '/collaborators', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': company.id, 'X-Runly-Studio-Protocol': '3', 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: peer.id, role: 'EDITOR' }) })
  assert.equal(shared.status, 200)
  const before = await api(root), browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    async function open(user, pageId) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage(); contexts.push(context)
      await page.goto(stack.urls.web + '/app/login'); await page.locator('#identifier').fill(user.email); await page.locator('#password').fill(user.password)
      await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click(); await page.waitForURL(url => !url.pathname.includes('/login'))
      await page.goto(stack.urls.web + `/app/m/runly.studio/?design=${made.id}&pageId=${pageId}`); await page.locator('.upper-canvas').waitFor({ timeout: 60000 })
      return page
    }
    const page = await open(owner, 'p2'), other = await open(peer, 'page-1')
    await sleep(1200)
    assert.equal((await api(root)).revision, before.revision, 'Opening API text must not autosave renderer metrics')
    for (const profile of ['rgb', 'cmyk']) for (const scope of ['current', 'all', 'range']) {
      await page.getByRole('button', { name: 'Descargar', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Descargar', exact: true })
      await dialog.getByRole('radio', { name: /^PDF/ }).click()
      await dialog.getByRole('radiogroup', { name: 'Perfil de color', exact: true }).getByRole('radio', { name: profile === 'rgb' ? 'RGB' : 'CMYK', exact: true }).click()
      await dialog.getByRole('radiogroup', { name: 'Páginas a incluir', exact: true }).getByRole('radio', { name: scope === 'current' ? 'Actual' : scope === 'all' ? 'Todas (16)' : 'Rango', exact: true }).click()
      if (scope === 'range') await dialog.getByLabel('Rango de páginas', { exact: true }).fill('1-3, 5')
      await dialog.locator('label').filter({ hasText: 'Resolución del diseño' }).locator('..').getByRole('button').click()
      await page.getByRole('option', { name: '300 ppp', exact: true }).click()
      const bleed = dialog.getByRole('checkbox', { name: 'Sangrado de 3 mm', exact: true }); if (await bleed.isChecked()) await dialog.getByText('Sangrado de 3 mm', { exact: true }).click()
      await dialog.getByRole('button', { name: 'Descargar', exact: true }).click()
      const download = page.waitForEvent('download', { timeout: 60000 }).then(download => ({ download }), error => ({ error }))
      await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
      const filename = `v7-text-${profile}-${scope}.pdf`, path = join(stack.directory, filename)
      const completed = await download; if (completed.error) throw completed.error
      await completed.download.saveAs(path)
      const pdf = await PDFDocument.load(await readFile(path)), indices = scope === 'current' ? [1] : scope === 'all' ? scenes.map((_, i) => i) : [0, 1, 2, 4]
      assert.equal(pdf.getPageCount(), indices.length)
      for (const [i, printed] of pdf.getPages().entries()) {
        const source = scenes[indices[i]].page
        assert.ok(Math.abs(printed.getWidth() - source.width * 72 / 300) < 0.001)
        assert.ok(Math.abs(printed.getHeight() - source.height * 72 / 300) < 0.001)
      }
      const images = pdf.context.enumerateIndirectObjects().map(([, o]) => o).filter(o => o.dict?.get?.(PDFName.of('Subtype'))?.toString() === '/Image')
      assert.equal(images.length, indices.length)
      assert.ok(images.every(o => o.dict.get(PDFName.of('ColorSpace')).toString() === (profile === 'rgb' ? '/DeviceRGB' : '/DeviceCMYK')))
      outputs.push({ filename, pages: indices.length }); assert.equal((await api(root)).revision, before.revision)
    }
    assert.deepEqual((await api(root)).document, before.document)
    assert.ok(!other.isClosed())
    console.log('Studio v7: two authenticated sessions preserve API text heights; actual/current/range 16-page RGB/CMYK UI downloads pass without a revision write')
    return { outputs, twoSessions: true, noRendererWrites: true }
  } catch (error) {
    for (const [index, context] of contexts.entries()) for (const page of context.pages()) await page.screenshot({ path: join(stack.directory, `v7-text-failure-${index}.png`) }).catch(() => {})
    throw error
  } finally { await browser.close() }
}
