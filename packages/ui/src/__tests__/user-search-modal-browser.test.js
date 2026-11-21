import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

// Regression for the "Buscar usuario" request loop: a parent that passes a new
// excludeIds array on every render (or none at all) must still produce one
// request per opening, one per debounced term, and abort what it leaves behind.
export async function runUserSearchScenario(componentPath) {
  const require = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url))
  const { build } = createRequire(new URL('../../../module-compiler/package.json', import.meta.url))('esbuild')
  const { chromium } = require('playwright')
  const bundle = await build({
    stdin: {
      contents: `
      import {useState} from 'react';import {createRoot} from 'react-dom/client';
      import {UserSearchModal} from '${componentPath}';
      function App(){const[open,setOpen]=useState(false);const[tick,setTick]=useState(0);const[picked,setPicked]=useState('');
        return <><button onClick={()=>setOpen(true)}>Abrir</button><button onClick={()=>setTick(t=>t+1)}>Tick</button><output>{picked}</output>
        {open?<UserSearchModal open apiBase="/api" token="t" companyId="c" onClose={()=>setOpen(false)} onConfirm={(id)=>setPicked(id)}/>:null}</>}
      createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'jsx',
    },
    bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false, logLevel: 'silent',
  })
  const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/app.js' ? bundle.outputFiles[0].contents : '<div id="root"></div><script type="module" src="/app.js"></script>') })
  const users = [1, 2, 3].map((n) => ({ id: `u${n}`, display_name: `Ana ${n}`, email: `ana${n}@example.test` }))
  const seen = { all: [], aborted: 0, errors: [] }
  let browser
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    page.on('pageerror', (e) => seen.errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') seen.errors.push(m.text()) })
    page.on('requestfailed', (r) => { if (r.url().includes('/users/search')) seen.aborted++ })
    await page.route('**/api/users/search**', async (route) => {
      const url = new URL(route.request().url())
      seen.all.push(url.search)
      await new Promise((r) => setTimeout(r, url.searchParams.get('q') === 'lento' ? 1500 : 120))
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: users, hasMore: false }) }).catch(() => {})
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const count = () => seen.all.length
    const box = () => page.getByPlaceholder('Nombre o correo electrónico...')
    const result = {}

    await page.getByRole('button', { name: 'Abrir' }).click()
    await page.waitForTimeout(2500)
    result.openIdle = count()
    result.listed = await page.getByText('Ana 1').isVisible().catch(() => false)

    let before = count()
    await box().pressSequentially('ana', { delay: 40 })
    await page.waitForTimeout(900)
    result.typing = count() - before
    result.typingQueries = seen.all.slice(before)

    before = count()
    await box().fill('lento')
    await page.waitForTimeout(450)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1800)
    result.closeDuringRequest = { requests: count() - before, aborted: seen.aborted }

    before = count()
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Abrir' }).click()
      await page.waitForTimeout(400)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    }
    result.reopen3 = count() - before

    await page.getByRole('button', { name: 'Abrir' }).click()
    await page.getByText('Ana 1').waitFor().catch(() => {})
    result.confirmDisabledBefore = await page.getByRole('button', { name: 'Confirmar' }).isDisabled().catch(() => null)
    await box().press('ArrowDown')
    await box().press('Enter')
    result.confirmEnabledAfter = await page.getByRole('button', { name: 'Confirmar' }).isEnabled().catch(() => false)
    await page.getByRole('button', { name: 'Confirmar' }).click().catch(() => {})
    result.picked = await page.locator('output').textContent()
    result.errors = seen.errors
    result.total = count()
    return result
  } finally {
    await browser?.close()
    server.close()
  }
}

test('Buscar usuario: one request per opening and term, aborted on close, keyboard pick', { timeout: 90000 }, async () => {
  const r = await runUserSearchScenario('./components/UserSearchModal.jsx')
  assert.equal(r.openIdle, 1, 'opening without typing loads the list once and stays quiet')
  assert.ok(r.listed, 'suggestions show without typing')
  assert.equal(r.typing, 1, `typing fast is debounced into one search: ${r.typingQueries.join(' ')}`)
  assert.match(r.typingQueries[0], /q=ana/)
  assert.equal(r.closeDuringRequest.requests, 1)
  assert.ok(r.closeDuringRequest.aborted >= 1, 'closing aborts the request in flight')
  assert.ok(r.reopen3 <= 1, `reopening reuses the recent listing (got ${r.reopen3})`)
  assert.ok(r.confirmDisabledBefore && r.confirmEnabledAfter, 'Confirmar only after a choice')
  assert.equal(r.picked, 'u2')
  assert.deepEqual(r.errors, [])
})
