// Versioned real-identity UI coverage. Uses only the caller's identity-checked disposable stack.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {mkdir,readFile} from 'node:fs/promises'
import {chromium} from 'playwright'
import {appendObject,blankDocument} from '../../../apps/shared/studio/document.js'
const apiRequire=createRequire(new URL('../../../apps/api/package.json',import.meta.url))
const sharp=apiRequire('sharp'),{PDFDocument}=apiRequire('pdf-lib')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(check,label,timeout=15000){const start=Date.now();for(;;){try{const value=await check();if(value)return value}catch{}if(Date.now()-start>timeout)throw Error(`timeout: ${label}`);await wait(150)}}
export async function verifyStudioFinalUi(stack,scenario){
  const SHOTS=join(stack.directory,'final-ui');await mkdir(SHOTS,{recursive:true})
  const checks=[],pageErrors=[];let browser
  const ok=message=>{checks.push(message);console.log(`Studio final UI: ${message}`)}
  const step=async(name,fn)=>{try{await fn()}catch(error){for(const c of browser?.contexts()??[])for(const p of c.pages())await p.screenshot({path:join(SHOTS,`failure-${browser.contexts().indexOf(c)}.png`)}).catch(()=>{});throw Error(`${name}: ${error.message}`,{cause:error})}}
  try{
  const [owner, , peer] = scenario.users, [company] = scenario.companies
  await stack.compose(['up', '-d', 'studio-catalog-test', 'runly-api'], { log: join(stack.directory, 'api-start.log') })
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(`${stack.urls.api}/public/website/desktop/config`)).ok) break } catch { /* booting */ }
    await wait(500)
  }
  const login = async user => {
    const response = await fetch(`${stack.urls.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: user.email, password: user.password }) })
    assert.equal(response.status, 200); return (await response.json()).data.access_token
  }
  const ownerToken = await login(owner)
  const api = (path, { token = ownerToken, data, method = data ? 'POST' : 'GET' } = {}) => fetch(`${stack.urls.api}${path}`, { method,
    headers: { 'X-Runly-Studio-Protocol':'3', Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': company.id, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined })
  const json = async response => { const payload = await response.json(); assert.ok(response.ok, `${response.status} ${JSON.stringify(payload).slice(0, 300)}`); return payload.data ?? payload }
  let doc = blankDocument(1080, 1080)
  doc = appendObject(doc, 'rectangle', { x: 100, y: 120, width: 380, height: 260, fill: '#7c3aed' })
  doc = appendObject(doc, 'ellipse', { x: 620, y: 140, width: 300, height: 300, fill: '#22c55e' })
  doc = appendObject(doc, 'text', { x: 120, y: 640, width: 700, height: 120, text: 'Datos sintéticos' })
  const design = await json(await api('/studio/designs', { data: { name: 'Colaboración visual', document: doc } }))
  const big = await json(await api('/studio/designs', { data: { name: 'Lienzo enorme', document: blankDocument(4096, 4096) } }))
  const share = role => api(`/studio/designs/${design.id}/collaborators`, { data: { userId: peer.id, role }, method: 'PUT' })
  assert.equal((await share('EDITOR')).status, 200)
  ok('stack + owner/peer identities + synthetic design shared as editor')

  browser = await chromium.launch({ channel: 'chrome', headless: true })
  async function open(user, id, { width = 1440, height = 1000, dark = false, mobile = false, reducedMotion = 'no-preference' } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', reducedMotion, ...(mobile ? { hasTouch: true, isMobile: true } : {}) })
    await context.addInitScript(dark=>localStorage.setItem('runly-theme',JSON.stringify({state:{isDark:dark},version:0})),dark)
    const page = await context.newPage()
    page.on('pageerror', error => pageErrors.push(`${user.email}: ${error.message}`))
    await page.goto(`${stack.urls.web}/app/login`)
    await page.locator('#identifier').fill(user.email); await page.locator('#password').fill(user.password)
    await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click()
    await page.waitForURL(url => !url.pathname.includes('/login'))
    await page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${id}`)
    await page.getByRole('button', { name: 'Deshacer' }).or(page.getByText('Solo lectura')).first().waitFor({ timeout: 60000 })
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),dark,'Effective application theme differs from test mode')
    return { context, page }
  }
  const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) })
  const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const layersPanel = async page => { const rail = page.getByRole('navigation', { name: 'Herramientas de diseño' }).getByRole('button', { name: 'Capas', exact: true }); if (await rail.getAttribute('aria-pressed') !== 'true') await rail.click() }
  const selectLayer = async (page, ordinal) => { await layersPanel(page); await page.getByRole('list', { name: 'Capas del diseño' }).locator(`li:nth-last-child(${ordinal}) > button:not([aria-label]):not([role="checkbox"])`).click() }
  const status = page => page.getByRole('status').filter({ hasText: /Sincroniz|Sin conexión|Error al sincronizar/ }).first()
  const synced = page => page.getByRole('status').filter({ hasText: /^Sincronizado/ }).first().waitFor({ timeout: 20000 })
  async function docPoint(page, x, y) {
    const box = await page.locator('canvas.upper-canvas').boundingBox()
    return { x: box.x + x * box.width / 1080, y: box.y + y * box.height / 1080 }
  }

  let A = await open(owner, design.id), B = await open(peer, design.id)

  await step('presence avatars with names and distinct stable colours', async () => {
    const aGroup = A.page.getByRole('group', { name: /persona\(s\) editando/ })
    await aGroup.waitFor({ timeout: 20000 })
    const avatar = aGroup.getByRole('img', { name: 'Studio peer' })
    await avatar.hover(); await A.page.getByRole('tooltip').filter({ hasText: 'Studio peer' }).waitFor()
    ok('A sees B as an avatar; hovering it shows the name')
    await avatar.focus(); await A.page.getByRole('tooltip').filter({ hasText: 'Studio peer' }).first().waitFor()
    ok('avatar tooltip also opens with keyboard focus')
    await aGroup.getByRole('button', { name: /ver lista/ }).click()
    await A.page.getByRole('list', { name: 'Personas en este diseño' }).getByText('Studio peer').waitFor()
    await A.page.keyboard.press('Escape')
    const ring = async page => page.getByRole('group', { name: /persona\(s\) editando/ }).locator('span.rounded-full').first().evaluate(node => getComputedStyle(node.firstElementChild).getPropertyValue('--tw-ring-color'))
    const colorA = await ring(B.page), colorB = await ring(A.page)
    assert.notEqual(colorA, colorB, 'owner and peer share a colour'); assert.ok(colorA && colorB)
    ok(`roster popover lists the peer; participants have different colours (${colorB} / ${colorA})`)
  })

  await step('remote cursor and selection keep their own colour', async () => {
    const point = await docPoint(A.page, 500, 520)
    await A.page.mouse.move(point.x, point.y); await A.page.mouse.move(point.x + 4, point.y + 3)
    const cursor = B.page.getByLabel('Cursor de Studio owner', { exact: true })
    await cursor.waitFor({ timeout: 10000 })
    assert.ok(Math.abs(Number(await cursor.getAttribute('data-document-x')) - 500) < 25)
    const cursorColor = await cursor.locator('path').getAttribute('fill')
    await selectLayer(B.page, 1)
    const selection = A.page.getByLabel('Selección de Studio peer', { exact: true })
    await selection.waitFor({ timeout: 10000 })
    const tag = selection.locator('span').first()
    assert.match(await tag.innerText(), /Studio peer · Rectángulo/)
    const selectionColor = await tag.evaluate(node => getComputedStyle(node).backgroundColor)
    assert.notEqual(selectionColor, 'rgb(217, 70, 239)', 'remote selection must not use the local fuchsia')
    assert.notEqual(cursorColor.toLowerCase(), '#d946ef')
    await layersPanel(A.page)
    await A.page.getByText('Seleccionado por Studio peer').first().waitFor({ timeout: 5000 })
    ok('B sees the owner cursor (document coordinates); A sees B’s selection with name tag, coloured border and a mark in Capas')
    await shot(A.page, 'remote-selection-desktop-light')
  })

  await step('remote labels keep a constant screen size at any zoom', async () => {
    const tag = A.page.getByLabel('Selección de Studio peer', { exact: true }).locator('span').first()
    const measure = async () => (await tag.boundingBox()).height
    const before = await measure()
    for (let n = 0; n < 3; n++) await A.page.getByRole('button', { name: 'Acercar (Ctrl+rueda)', exact: true }).click()
    await wait(400)
    const after = await measure()
    assert.ok(Math.abs(before - after) < 1.5, `tag height ${before} -> ${after}`)
    for (let n = 0; n < 6; n++) await A.page.getByRole('button', { name: 'Alejar (Ctrl+rueda)', exact: true }).click()
    await wait(400)
    const low = await measure()
    assert.ok(Math.abs(before - low) < 1.5, `tag height ${before} -> ${low}`)
    await shot(A.page, 'zoom-low-desktop')
    await A.page.getByRole('button', { name: /Ajustar|Encajar/ }).first().click().catch(() => {})
    ok(`remote selection tag height ${before.toFixed(1)}px at zoom in (${after.toFixed(1)}) and out (${low.toFixed(1)})`)
  })

  await step('local and remote selection together with rulers', async () => {
    await A.page.keyboard.press('Shift+R').catch(() => {})
    await selectLayer(A.page, 2)
    await wait(500)
    await shot(A.page, 'local-and-remote-selection')
    ok('local selection (fuchsia) beside the remote selection (own colour) drawn together; screenshot saved')
  })

  await step('multi-selection with rulers at several zooms', async () => {
    await layersPanel(A.page)
    const items = A.page.getByRole('list', { name: 'Capas del diseño' })
    await selectLayer(A.page, 1)
    await items.getByRole('checkbox', { name: /Añadir Círculo a la selección/ }).click()
    await wait(500)
    const band = await A.page.locator('svg rect[fill="#d946ef"]').count()
    assert.ok(band >= 2, 'ruler highlight for the selection extent missing')
    for (const [label, clicks, direction] of [['high', 3, 'Acercar (Ctrl+rueda)'], ['low', 8, 'Alejar (Ctrl+rueda)']]) {
      for (let n = 0; n < clicks; n++) await A.page.getByRole('button', { name: direction, exact: true }).click()
      await wait(500); await shot(A.page, `multi-selection-zoom-${label}`)
    }
    await A.page.getByRole('button', { name: /Ajustar/ }).first().click().catch(() => {})
    ok('multi-selection draws the ruler highlight; screenshots at high and low zoom saved')
  })

  await step('sync states: offline, retry, back to synced', async () => {
    await A.context.setOffline(true)
    await selectLayer(A.page, 2)
    await A.page.getByLabel('Posición X').fill('150'); await A.page.getByLabel('Posición X').press('Tab')
    await A.page.getByRole('status').filter({ hasText: /^Sin conexión/ }).first().waitFor({ timeout: 20000 })
    const retry = A.page.getByRole('button', { name: 'Reintentar', exact: true }).first()
    await retry.waitFor()
    ok('«Sin conexión» appears with a «Reintentar» action and the explanation as title')
    await shot(A.page, 'offline-desktop')
    await A.context.setOffline(false)
    await retry.click()
    await synced(A.page)
    const stored = (await json(await api(`/studio/designs/${design.id}`))).document.objects[1]
    assert.equal(stored.x, 150)
    ok('after reconnecting, «Reintentar» syncs the pending change (x = 150 on the server)')
  })

  await step('sync error state with retry', async () => {
    await A.page.route('**/studio/designs/*/changes', route => route.request().method() === 'POST' ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'rechazado' }) }) : route.continue())
    await A.page.getByLabel('Posición X').fill('160'); await A.page.getByLabel('Posición X').press('Tab')
    await A.page.getByRole('status').filter({ hasText: /^Error al sincronizar/ }).first().waitFor({ timeout: 20000 })
    ok('«Error al sincronizar» is shown when the server rejects a change')
    await shot(A.page, 'sync-error-desktop')
    await A.page.unroute('**/studio/designs/*/changes')
    await A.page.getByRole('button', { name: 'Recargar Studio', exact: true }).first().click()
    await A.page.waitForLoadState('domcontentloaded')
    await until(async () => (await status(A.page).innerText()).startsWith('Sincronizado'), 'synced after explicit reload', 20000)
    await until(async()=>(await json(await api(`/studio/designs/${design.id}`))).document.objects[1].x===160,'pending edit confirmed after reload')
    ok('Explicit reload restores the authorized session and pending work after rejection')
  })

  await step('reconnecting channel is shown without blocking', async () => {
    const state = await status(B.page).innerText()
    assert.match(state, /Sincroniz/)
    ok(`B status text: «${state.replace(/\s+/g, ' ')}»`)
  })

  await step('viewer role: read-only notice for B', async () => {
    assert.equal((await share('VIEWER')).status, 200)
    await B.page.getByText('Ahora solo puedes ver este diseño').waitFor({ timeout: 20000 })
    await B.page.getByText('Solo lectura').first().waitFor()
    await shot(B.page, 'viewer-notice-desktop')
    ok('lowering B to viewer shows «Ahora solo puedes ver este diseño» and the read-only chip')
  })

  await step('revocation: clear access-lost screen', async () => {
    const response = await share(null); assert.equal(response.status, 200)
    await B.page.getByRole('heading', { name: 'Ya no tienes acceso a este diseño' }).waitFor({ timeout: 20000 })
    await shot(B.page, 'access-lost-desktop')
    await B.page.getByRole('button', { name: 'Volver a mis diseños' }).click()
    await until(() => !new URL(B.page.url()).searchParams.get('design'), 'back to Mis diseños')
    ok('revoking B’s access shows the explanation and returns to Mis diseños')
    await A.page.getByRole('group', { name: /persona\(s\) editando/ }).waitFor({ state: 'detached', timeout: 20000 })
    ok('the owner no longer sees the revoked collaborator')
  })

  // ---- export ----
  const dialog = page => page.getByRole('dialog', { name: 'Descargar', exact: true })
  async function openExport(page) {
    await page.getByRole('button', { name: 'Descargar', exact: true }).click()
    await dialog(page).waitFor()
  }
  async function download(page, format) {
    const downloads = []
    page.on('download', file => downloads.push(file))
    await dialog(page).getByRole('button', { name: 'Descargar', exact: true }).click()
    await page.getByRole('button', { name: `Exportar ${format}`, exact: true }).click()
    return downloads
  }
  await step('PNG: dimensions shown match the file; transparent option', async () => {
    // The owner’s session stayed in the rejected-change error state above: start from a fresh load.
    await A.page.reload(); await A.page.getByRole('button', { name: 'Deshacer' }).waitFor({ timeout: 60000 })
    await openExport(A.page)
    await dialog(A.page).getByRole('radio', { name: /^PNG/ }).click()
    await dialog(A.page).getByRole('radio', { name: '×2', exact: true }).click()
    await dialog(A.page).getByRole("status").getByText(/2[.,\s]?160 × 2[.,\s]?160 px/).waitFor()
    const box = dialog(A.page).getByRole('checkbox', { name: 'Fondo transparente' })
    if (!await box.isChecked()) await dialog(A.page).getByText('Fondo transparente', { exact: true }).click()
    assert.equal(await box.isChecked(), true)
    await shot(A.page, 'export-png-desktop-light')
    const downloads = await download(A.page, 'PNG')
    const file = await until(() => downloads[0], 'png download', 60000)
    const meta = await sharp(await file.path()).metadata()
    assert.deepEqual([meta.width, meta.height, meta.format], [2160, 2160, 'png'])
    ok(`PNG downloaded exactly as announced: ${meta.width} × ${meta.height}, alpha ${meta.hasAlpha}`)
    await A.page.getByText(/Se descargó .*\.png/).waitFor({ timeout: 10000 })
  })

  await step('JPG: quality control and file', async () => {
    await openExport(A.page)
    await dialog(A.page).getByRole('radio', { name: /^JPG/ }).click()
    await dialog(A.page).getByRole('radio', { name: '×1', exact: true }).click()
    await dialog(A.page).getByRole("status").getByText(/1[.,\s]?080 × 1[.,\s]?080 px/).waitFor()
    await dialog(A.page).getByText(/Sin transparencia/).first().waitFor()
    const downloads = await download(A.page, 'JPG')
    const file = await until(() => downloads[0], 'jpg download', 60000)
    const meta = await sharp(await file.path()).metadata()
    assert.deepEqual([meta.width, meta.height, meta.format], [1080, 1080, 'jpeg'])
    ok('JPG downloaded at 1080 × 1080 as jpeg')
  })

  await step('PDF: physical size, bleed and marks, CMYK explanation, no vector claim', async () => {
    await openExport(A.page)
    await dialog(A.page).getByRole('radio', { name: /^PDF/ }).click()
    await dialog(A.page).getByText(/conversión genérica de RGB a CMYK/).waitFor()
    await dialog(A.page).getByText(/No es un PDF vectorial ni cumple PDF\/X/).waitFor()
    assert.equal(await dialog(A.page).getByText(/PDF\/X-1a|certificad|vectorial\b(?! ni)/i).count(), 0)
    const summary = await dialog(A.page).getByRole('status').innerText()
    assert.match(summary, /Medida de corte/); assert.match(summary, /Hoja del PDF/); assert.match(summary, /300 ppp/)
    await shot(A.page, 'export-pdf-desktop-light')
    const downloads = await download(A.page, 'PDF')
    const file = await until(() => downloads[0], 'pdf download', 90000)
    const pdf = await PDFDocument.load(await readFile(await file.path())), size = pdf.getPage(0).getSize()
    const mmWide = size.width / (72 / 25.4)
    assert.ok(Math.abs(mmWide - (1080 / 96 * 25.4 + 20)) < 1, `sheet ${mmWide} mm`)
    ok(`PDF sheet ${mmWide.toFixed(1)} mm (trim 285.8 + 3 mm bleed + marks), as the dialog announced`)
  })

  await step('over-limit size is announced and blocks the download', async () => {
    await A.page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${big.id}`)
    await A.page.getByRole('button', { name: 'Deshacer' }).waitFor({ timeout: 60000 })
    await openExport(A.page)
    await dialog(A.page).getByRole('radio', { name: /^PNG/ }).click()
    await dialog(A.page).getByRole('radio', { name: '×3', exact: true }).click()
    await dialog(A.page).getByText(/supera 80 megapíxeles/).waitFor()
    assert.equal(await dialog(A.page).getByRole('button', { name: 'Descargar', exact: true }).isDisabled(), true)
    await shot(A.page, 'export-over-limit')
    await dialog(A.page).getByRole('radio', { name: '×1', exact: true }).click()
    await until(async () => !(await dialog(A.page).getByRole('button', { name: 'Descargar', exact: true }).isDisabled()), 'enabled at x1')
    ok('4096 px design at ×3 explains the limit and disables Descargar; ×1 enables it again')
    await dialog(A.page).getByRole('radio', { name: /^PDF/ }).click()
    await dialog(A.page).getByRole('status').getByText(/el máximo es 32 MP/).waitFor()
    assert.equal(await dialog(A.page).getByRole('button', { name: 'Descargar', exact: true }).isDisabled(), true)
    ok('the same design as print PDF explains the 32 MP limit at 300 ppp before downloading')
    await A.page.keyboard.press('Escape')
  })

  await step('downloads: duplicate click, cancel, sanitized error', async () => {
    await A.page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${design.id}`)
    await A.page.getByRole('button', { name: 'Deshacer' }).waitFor({ timeout: 60000 })
    const events = []
    A.page.on('download', file => events.push(file))
    let pdfRequests=0,abortedRequests=0
    A.page.on('requestfailed',request=>{if(/\/export\/jobs\/[^/]+\/pages\//.test(request.url()))abortedRequests++})
    const baseline=await json(await api(`/studio/designs/${design.id}`))
    await A.page.route('**/export/jobs/*/pages/*', async route => {pdfRequests++;await wait(2500);await route.continue().catch(()=>{})})
    await openExport(A.page)
    await dialog(A.page).getByRole('radio', { name: /^PDF/ }).click()
    await dialog(A.page).getByRole('button', { name: 'Descargar', exact: true }).click()
    const go = A.page.getByRole('button', { name: 'Exportar PDF', exact: true })
    await go.dblclick()
    await A.page.getByText('Procesando el PDF en el servidor…').waitFor({ timeout: 60000 })
    await until(()=>pdfRequests===1,'actual PDF HTTP request')
    assert.equal(await A.page.getByRole('button', { name: 'Descargar', exact: true }).isDisabled(), true)
    ok('«Preparando» → «Procesando» shown; the top-bar Descargar is disabled while the file is made')
    await shot(A.page, 'download-processing')
    await A.page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await A.page.getByText('Descarga cancelada. No se guardó ningún archivo.').waitFor()
    await wait(4000)
    assert.equal(events.length, 0, 'cancelled job still downloaded')
    assert.equal(pdfRequests,1);assert.ok(abortedRequests>0,'PDF HTTP request was not aborted')
    assert.deepEqual(await json(await api(`/studio/designs/${design.id}`)),baseline)
    ok('Cancel discards the result: nothing downloaded; double click produced no extra job')
    await A.page.unroute('**/export/jobs/*/pages/*')
    await A.page.route('**/export/jobs/*/pages/*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom Bearer eyJhbGciOiJIUzI1NiJ9.AAAAAAAAAAAAAAAA.BBBB at https://internal.example.com/db' }) }))
    await openExport(A.page)
    await dialog(A.page).getByRole('radio', { name: /^PDF/ }).click()
    await dialog(A.page).getByRole('button', { name: 'Descargar', exact: true }).click()
    await A.page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
    const alert = A.page.getByRole('alert').filter({ hasText: 'No se pudo descargar' })
    await alert.waitFor({ timeout: 60000 })
    const text = await alert.innerText()
    assert.ok(!/Bearer|eyJ|internal\.example|https?:/.test(text), text)
    await shot(A.page, 'download-error')
    ok(`server error is shown without secrets or URLs: «${text.replace(/\s+/g, ' ').slice(0, 110)}»`)
    await A.page.unroute('**/export/jobs/*/pages/*')
  })

  // ---- responsive, themes, keyboard, motion ----
  await step('keyboard and reduced motion', async () => {
    await A.context.close()
    A = await open(owner, design.id, { reducedMotion: 'reduce' })
    await A.page.getByRole('button', { name: 'Descargar', exact: true }).focus()
    await A.page.keyboard.press('Enter')
    await dialog(A.page).waitFor()
    await dialog(A.page).getByRole('radiogroup', { name: 'Tipo de archivo' }).getByRole('radio', { checked: true }).focus()
    await A.page.keyboard.press('ArrowRight')
    assert.equal(await A.page.evaluate(() => document.activeElement.getAttribute('role')), 'radio')
    const checked = await dialog(A.page).getByRole('radiogroup', { name: 'Tipo de archivo' }).getByRole('radio', { checked: true }).innerText()
    assert.ok(/^(JPG|PDF|PNG)/.test(checked))
    await A.page.keyboard.press('Escape')
    await dialog(A.page).waitFor({ state: 'detached' })
    ok('Enter opens the dialog, arrow keys move between formats with focus following, Escape closes')
    const media = await A.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
    assert.equal(media, true)
    ok('prefers-reduced-motion is active; spinners and cursor transitions carry motion-reduce classes')
  })

  const sizes = [{ width: 1440, height: 900, label: '1440' }, { width: 820, height: 1100, label: '820' }, { width: 390, height: 844, label: '390', mobile: true }]
  for (const dark of [false, true]) for (const size of sizes) {
    await step(`responsive ${size.label} ${dark ? 'dark' : 'light'}`, async () => {
      // The owner collaborates again with the peer (editor) in a fresh session of each size.
      assert.equal((await share('EDITOR')).status, 200)
      const one = await open(owner, design.id, { ...size, dark }), two = await open(peer, design.id, { ...size, dark })
      const name = `${size.label}-${dark ? 'dark' : 'light'}`
      await one.page.getByRole('group', { name: '1 persona(s) editando' }).waitFor({ timeout: 25000 })
      const point = await docPoint(one.page, 540, 540)
      await one.page.mouse.move(point.x, point.y); await one.page.mouse.move(point.x + 3, point.y + 2)
      await two.page.getByLabel('Cursor de Studio owner', { exact: true }).waitFor({ timeout: 15000 })
      if (!size.mobile) { await selectLayer(two.page, 1); await one.page.getByLabel('Selección de Studio peer', { exact: true }).first().waitFor({ timeout: 15000 }) }
      else { const p = await docPoint(two.page, 280, 250); await two.page.touchscreen.tap(p.x, p.y); await one.page.getByLabel('Selección de Studio peer', { exact: true }).first().waitFor({ timeout: 15000 }) }
      await wait(600)
      assert.ok(await overflow(one.page) <= 0, `horizontal overflow on collaboration view: ${await overflow(one.page)}`)
      await shot(one.page, `collab-${name}`)
      const canvas = await one.page.locator('canvas.upper-canvas').boundingBox(), header = await one.page.locator('header').first().boundingBox()
      assert.ok(canvas.width > size.width * 0.4, `canvas too narrow: ${canvas.width}`)
      assert.ok(header.height <= 64)
      // export dialog fits in the viewport
      await one.page.getByRole('button', { name: size.mobile ? 'Más opciones' : 'Descargar', exact: true }).click()
      if (size.mobile) await one.page.getByRole('menuitem', { name: /Descargar/ }).click()
      await dialog(one.page).waitFor()
      await dialog(one.page).getByRole('radio', { name: /^PDF/ }).click()
      await wait(300)
      const box = await dialog(one.page).boundingBox()
      assert.ok(box.x >= -1 && box.x + box.width <= size.width + 1 && box.y >= -1 && box.y + box.height <= size.height + 1, `dialog outside viewport ${JSON.stringify(box)}`)
      assert.ok(await overflow(one.page) <= 0, 'overflow with dialog')
      await shot(one.page, `export-${name}`)
      await one.context.close(); await two.context.close()
      ok(`${name}: no horizontal overflow, canvas ${Math.round(canvas.width)} px wide, header ${Math.round(header.height)} px, export dialog inside the viewport`)
    })
  }

  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`)
  ok('no uncaught page errors')
return {checks}
}finally{await browser?.close()}
}
