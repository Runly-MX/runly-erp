// Functional walk in Chromium over the shared components touched by lazy loading / chunking.
// Usage: node functional-walk.mjs <webBase>
// env: E2E_USER_*, PERF_API (API base), PERF_COMPANY_ID (a TEST company: this script writes there and cleans up)
import { chromium } from 'playwright'

const base = process.argv[2]
const CO = process.env.PERF_COMPANY_ID
const API = process.env.PERF_API
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX' })
await ctx.addInitScript((id) => { try { localStorage.setItem('runly-active-company', id) } catch {} }, CO)
const p = await ctx.newPage()
const bad = []
let phase = ''
p.on('pageerror', (e) => bad.push(`[${phase}] pageerror: ${e.message.slice(0, 120)}`))
p.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && /dynamically imported|ChunkLoad|is not a function|is not defined|Cannot read|Invalid hook|Minified React|Objects are not valid|not a valid/i.test(t)) bad.push(`[${phase}] console: ${t.slice(0, 140)}`)
})
p.on('requestfailed', (r) => { if (/\/assets\/.*\.(js|css|wasm)/.test(r.url())) bad.push(`[${phase}] asset failed: ${r.url().split('/').pop()}`) })

const results = []
const step = async (name, fn) => {
  phase = name
  const before = bad.length
  try {
    const info = await fn()
    const errs = bad.slice(before)
    const pass = errs.length === 0
    results.push(pass)
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  [' + info + ']' : ''}${errs.length ? '\n        ' + errs.slice(0, 3).join('\n        ') : ''}`)
  } catch (e) {
    results.push(false)
    console.log(`FAIL  ${name}  [${String(e.message).split('\n')[0].slice(0, 140)}]`)
  }
}
const text = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ')
const open = async (path, wait = 5000) => {
  await p.goto(base + path)
  await p.waitForTimeout(wait)
  // Slow remote database: poll up to 25 s for the screen to have content before judging it empty.
  await p.waitForFunction(() => document.body.innerText.trim().length >= 60, null, { timeout: 25000 }).catch(() => {})
  const t = await text()
  if (t.length < 60) throw new Error('screen is empty')
  if (/Algo salió mal|Sin conexión|no se pudo cargar/i.test(t)) throw new Error('error screen: ' + t.slice(0, 80))
  return t
}
const session = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD }) }).then((r) => r.json())
const token = session.data.access_token
const api = async (method, path, data) => {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${token}`, 'x-runly-company-id': CO, ...(data ? { 'content-type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined })
  const t = await r.text()
  let j = null
  try { j = JSON.parse(t) } catch { /* not json */ }
  return { status: r.status, body: j }
}

await p.goto(base + '/app/login')
await p.locator('#identifier').fill(process.env.E2E_USER_EMAIL)
await p.locator('input[type="password"]').fill(process.env.E2E_USER_PASSWORD)
await p.locator('button[type="submit"]').click()
await p.waitForURL((u) => !/login/.test(u.pathname), { timeout: 60000 })
await p.waitForTimeout(5000)

const routes = [
  ['contacts', '/app/m/runly.contacts'], ['inventory', '/app/m/runly.inventory/inventory'], ['purchases', '/app/m/runly.purchases'],
  ['calendar', '/app/m/runly.calendar'], ['files', '/app/m/runly.files'], ['learning', '/app/m/runly.lms'], ['bookings', '/app/m/runly.bookings'],
  ['ledger (charts)', '/app/m/runly.ledger'], ['chat', '/app/m/runly.chat'], ['studio', '/app/m/runly.studio'], ['website', '/app/m/runly.website'],
  ['module builder', '/app/m/runly.core/builder'], ['module catalog', '/app/m/runly.core'],
]
for (const [name, path] of routes) await step(`open ${name}`, async () => (await open(path)).length + ' chars')

const stamp = Date.now()
await step('contacts: create (API) -> search (UI) -> open detail', async () => {
  const c = await api('POST', '/contacts', { name: `Walk Contacto ${stamp}`, type: 'person' })
  const id = (c.body?.data ?? c.body)?.id
  if (!id) throw new Error('create failed ' + c.status)
  try {
    await open('/app/m/runly.contacts/contacts', 3000)
    await p.locator('input[type="search"], input[placeholder*="uscar"]').first().fill(`Walk Contacto ${stamp}`)
    await p.waitForTimeout(2500)
    const row = p.getByText(`Walk Contacto ${stamp}`).first()
    await row.waitFor({ timeout: 15000 })
    await row.click()
    await p.waitForTimeout(2500)
    if (!(await text()).includes(`Walk Contacto ${stamp}`)) throw new Error('detail did not show the contact')
    return 'found and opened'
  } finally { await api('DELETE', `/contacts/${id}`) }
})
await step('contacts: new-record form renders shared fields', async () => {
  await open('/app/m/runly.contacts/contacts', 3000)
  await p.getByRole('button', { name: /nuevo|crear|agregar/i }).first().click({ timeout: 8000 })
  await p.waitForTimeout(2000)
  const n = await p.locator('input:visible, textarea:visible').count()
  if (n < 2) throw new Error('form has ' + n + ' inputs')
  return n + ' inputs'
})
await step('notes (TipTap): create, type, autosave, reopen', async () => {
  const n = await api('POST', '/notes', { title: `Walk Nota ${stamp}`, content: '<p>inicial</p>', noteType: 'document' })
  const note = n.body?.note ?? n.body?.data?.note ?? n.body
  if (!note?.id) throw new Error('create failed ' + n.status)
  try {
    await open('/app/m/runly.notes', 3500)
    await p.getByText(`Walk Nota ${stamp}`).first().click({ timeout: 20000 })
    const ed = p.locator('.ProseMirror').first()
    await ed.waitFor({ timeout: 30000 })
    await ed.click()
    await p.keyboard.press('End')
    await p.keyboard.type(` escrito ${stamp}`)
    await p.waitForTimeout(6000)
    await p.reload()
    await p.waitForTimeout(6000)
    const again = p.locator('.ProseMirror').first()
    await again.waitFor({ timeout: 30000 })
    const t = await again.innerText()
    if (!t.includes(`escrito ${stamp}`)) throw new Error('typed text not persisted: ' + JSON.stringify(t.slice(0, 80)))
    return 'persisted after reload'
  } finally { await api('DELETE', `/notes/${note.id}`); await api('DELETE', `/notes/${note.id}/permanent`) }
})
await step('canvas (Excalidraw): create board, open, draw', async () => {
  const c = await api('POST', '/canvas/boards', { name: `Walk Tablero ${stamp}`, templateType: 'blank' })
  const board = c.body?.data ?? c.body
  if (!board?.id) throw new Error('create failed ' + c.status + ' ' + JSON.stringify(c.body).slice(0, 80))
  try {
    await open('/app/m/runly.canvas', 4000)
    await p.locator('li', { hasText: `Walk Tablero ${stamp}` }).locator('button, a').first().click({ timeout: 15000 })
    await p.waitForTimeout(7000)
    const n = await p.locator('canvas').count()
    if (!n) throw new Error('no <canvas> element')
    const box = await p.locator('canvas').first().boundingBox()
    await p.mouse.move(box.x + 200, box.y + 200)
    await p.mouse.down()
    await p.mouse.move(box.x + 320, box.y + 280, { steps: 6 })
    await p.mouse.up()
    return `${n} canvas elements, drag executed`
  } finally { await api('DELETE', `/canvas/boards/${board.id}`) }
})
await step('RME3 custom module screens', async () => {
  const out = []
  for (const k of ['custom.calibraciones', 'custom.prestamos']) {
    try { out.push(`${k}:${(await open(`/app/m/${k}`, 5000)).length}`) } catch (e) { out.push(`${k}:${e.message.slice(0, 40)}`) }
  }
  return out.join(' ')
})
console.log(bad.length ? `\nconsole/asset problems: ${bad.length}` : '\nno console/asset problems')
await browser.close()
process.exit(results.every(Boolean) ? 0 : 1)
