// Checks that the lazily loaded ApiErrorScreen renders when /instance/status fails, and that a plain retry panel
// replaces it if its chunk cannot be fetched. Usage: node error-screen-lazy.mjs <baseUrl>
import { chromium } from 'playwright'
const base = process.argv[2]
const b = await chromium.launch()
for (const blockChunk of [false, true]) {
  const p = await (await b.newContext()).newPage()
  await p.route('**/instance/status', (r) => r.abort())
  if (blockChunk) await p.route(/ApiErrorScreen-.*\.js/, (r) => r.abort())
  await p.goto(base + '/app/login')
  await p.waitForTimeout(6000)
  const body = (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 160)
  console.log(blockChunk ? 'chunk blocked ->' : 'chunk ok      ->', body, '| retry button:', await p.getByRole('button', { name: /reintentar/i }).count())
}
await b.close()
