// Deterministic performance regression guards (no browser, no network).
//   node scripts/ci/perf-guards.mjs                 source checks only (instant)
//   node scripts/ci/perf-guards.mjs --dist <dir>    also checks a built web bundle (`build:web --outDir <dir>` in apps/desktop)
//
// Budgets are REGRESSION budgets: set just above what was measured on 2026-11-25 so that going backwards fails.
// They are not the optimization targets (e.g. the 500 KB critical-JS goal in docs/audits/RUNLY_PERFORMANCE_F3_2_RESULTS.md).
// When an intentional change raises a number, change it here in the same commit and say why.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const KB = 1024
const BUDGET = {
  // Branding assets reachable from the login (loader, boot logo, login logo).
  smallImageBytes: 8 * KB,        // measured 4-6 KB
  mediumImageBytes: 32 * KB,      // measured 20-23 KB (loader art)
  loaderHtmlBytes: 16 * KB,       // measured 8 KB (was 1.4 MB with duplicated inline PNGs)
  indexHtmlBytes: 8 * KB,         // measured 3-5 KB
  inlineDataUriBytes: 2 * KB,     // no sizable base64 payloads in the boot documents
  // Built bundle (gzip): static import closure of index.html plus the AppEntry module it loads immediately.
  closureJsGzipBytes: 580 * KB,   // measured 525 KB gzip (111 files) on 2026-11-25
}
// Libraries that must never be in the login static closure. A library is recognised by the name of its chunk
// (bundler output is named after the package) or, where a string is unique to its code, by its content.
const HEAVY = {
  maplibre: { chunk: /^maplibre-gl-/ },
  livekit: { chunk: /^livekit-client/ },
  'hls.js': { chunk: /^hls-/ },
  excalidraw: { content: /excalidraw-container/ },
  'tiptap/prosemirror': { chunk: /tiptap|prosemirror/i, content: /ProseMirror/ },
  'motion/react': { content: /\bAnimatePresence\b/ },
}

const results = []
const ok = (name, pass, info = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  [' + info + ']' : ''}`) }
const read = (p) => readFileSync(join(root, p), 'utf8')
const size = (p) => (existsSync(join(root, p)) ? statSync(join(root, p)).size : -1)
const kb = (n) => `${(n / KB).toFixed(1)} KB`

// ---- source checks ----------------------------------------------------------------------------------------------
for (const tone of ['light', 'dark']) {
  for (const [file, max] of [[`isotipo-${tone}-sm.png`, BUDGET.smallImageBytes], [`logo-${tone}-sm.png`, BUDGET.smallImageBytes], [`isotipo-${tone}-md.png`, BUDGET.mediumImageBytes]]) {
    const n = size(`apps/desktop/public/runly/runly-${file}`)
    ok(`login-path image ${file} exists and is within ${kb(max)}`, n >= 0 && n <= max, n < 0 ? 'missing' : kb(n))
  }
}
for (const f of ['runly-loader.html', 'runly-loader-dark.html']) ok(`${f} within ${kb(BUDGET.loaderHtmlBytes)}`, size(`apps/desktop/public/runly/${f}`) <= BUDGET.loaderHtmlBytes, kb(size(`apps/desktop/public/runly/${f}`)))
ok(`index.html within ${kb(BUDGET.indexHtmlBytes)}`, size('apps/desktop/index.html') <= BUDGET.indexHtmlBytes, kb(size('apps/desktop/index.html')))

for (const f of ['apps/desktop/index.html', 'apps/desktop/public/runly/runly-loader.html', 'apps/desktop/public/runly/runly-loader-dark.html']) {
  const big = [...read(f).matchAll(/data:[a-z]+\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)/gi)].filter((m) => m[1].length * 0.75 > BUDGET.inlineDataUriBytes)
  ok(`${f.split('/').pop()} has no inline base64 over ${kb(BUDGET.inlineDataUriBytes)}`, big.length === 0, big.length ? `${big.length} payloads, largest ${kb(Math.max(...big.map((m) => m[1].length * 0.75)))}` : '')
}

// Boot screens must use the sized variants; the full-size originals are for emails, PDFs and stores.
const BOOT_FILES = ['apps/desktop/index.html', 'apps/desktop/src/auth/LoginScreen.jsx', 'apps/desktop/src/components/AppLoader.jsx', 'apps/desktop/src/components/ApiErrorScreen.jsx', 'apps/desktop/src/setup/SetupHero.jsx', 'apps/desktop/public/runly/runly-loader.html', 'apps/desktop/public/runly/runly-loader-dark.html']
const FULL_SIZE = /runly\/runly-(?:isotipo|logo)-(?:light|dark)\.png/
for (const f of BOOT_FILES) ok(`${f.split('/').pop()} does not reference full-size brand images`, existsSync(join(root, f)) && !FULL_SIZE.test(read(f)))

for (const f of ['apps/desktop/src/app/AppEntry.jsx', 'apps/desktop/src/components/AppLoader.jsx', 'apps/desktop/src/stores/bootLoader.js']) {
  ok(`${f.split('/').pop()} has no artificial startup floor`, existsSync(join(root, f)) && !/MIN_LOADER_MS|\bMIN_[A-Z_]*_MS\s*=\s*\d{3,}/.test(read(f)))
}

ok('call sounds are not preloaded by the pre-login hook', !/preloadCallSounds/.test(read('apps/desktop/src/modules/runly.chat/calls/useCallSoundUnlock.js')) && !/preloadCallSounds/.test(read('apps/desktop/src/app/AppEntry.jsx')))
ok('call sounds are enabled by the authenticated shell', /enableCallSounds\(\)/.test(read('apps/desktop/src/app/RunlyApp.jsx')))

const NO_STATIC = /from\s*['"](?:motion\/react|framer-motion|@tiptap\/[^'"]*|@excalidraw\/[^'"]*|maplibre-gl|hls\.js|livekit-client|pdfjs-dist[^'"]*|three|chart\.js)['"]/
for (const f of ['apps/desktop/src/app/AppEntry.jsx', 'apps/desktop/src/app/AppRouteGuard.jsx', 'apps/desktop/src/auth/LoginScreen.jsx', 'apps/desktop/src/auth/AuthProvider.jsx', 'apps/desktop/src/components/ErrorBoundary.jsx', 'apps/desktop/src/components/LazyApiErrorScreen.jsx']) {
  ok(`${f.split('/').pop()} imports no heavy library statically`, !NO_STATIC.test(read(f)))
}
const guardAndBoundary = read('apps/desktop/src/app/AppRouteGuard.jsx') + read('apps/desktop/src/components/ErrorBoundary.jsx')
ok('boot files load ApiErrorScreen and SetupWizard on demand', !/import\s*\{\s*ApiErrorScreen\s*\}\s*from/.test(guardAndBoundary) && !/import\s*\{\s*SetupWizard\s*\}\s*from/.test(guardAndBoundary))

// Narrow payload callers: the shell must keep asking for the slim contracts.
ok('shell asks /blueprints with slim+schema=0 for bundle metadata', /blueprints\.list\(token,\s*\{\s*slim:\s*1,\s*schema:\s*0\s*\}\)/.test(read('apps/desktop/src/shell/ModuleBundleLoader.jsx')))
ok('shell asks /runtime/modules with slim', /runtime\.modules\(token,\s*\{\s*slim:\s*true\s*\}\)/.test(read('apps/desktop/src/app/useRuntimeModules.js')) && /runtime\.modules\(token,\s*\{\s*slim:\s*true\s*\}\)/.test(read('apps/desktop/src/modules/runly.chat/hooks/useEntityBranding.js')))

// ---- dist checks ------------------------------------------------------------------------------------------------
const distArg = process.argv.indexOf('--dist')
if (distArg > 0) {
  const dist = resolve(process.argv[distArg + 1])
  const assets = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  const entries = [...html.matchAll(/(?:src|href)="\/?(?:app\/)?(assets\/[^"]+\.js)"/g)].map((m) => m[1])
  // index.html's entry loads the app module (AppEntry) with a dynamic import right away: it is part of what the login needs.
  const appEntry = assets.filter((f) => /^AppEntry-.*\.js$/.test(f)).map((f) => `assets/${f}`)
  ok('exactly one AppEntry chunk and at least one entry script in the build', appEntry.length === 1 && entries.length >= 1, `${appEntry.length} AppEntry, ${entries.length} entries`)
  const seen = new Set()
  const queue = [...entries, ...appEntry]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file) || !existsSync(join(dist, file))) continue
    seen.add(file)
    // Static imports only (`import"./x.js"`, `from"./x.js"`); a dynamic `import("./x.js")` has a parenthesis and is excluded.
    for (const m of readFileSync(join(dist, file), 'utf8').matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)) queue.push(`assets/${m[1]}`)
  }
  const jsGzip = [...seen].reduce((a, f) => a + gzipSync(readFileSync(join(dist, f))).length, 0)
  console.log(`INFO  login static closure (index + AppEntry): ${seen.size} JS files, ${kb(jsGzip)} gzip`)
  ok(`login static JS closure within ${kb(BUDGET.closureJsGzipBytes)} gzip`, jsGzip <= BUDGET.closureJsGzipBytes, kb(jsGzip))
  const closureText = [...seen].map((f) => readFileSync(join(dist, f), 'utf8')).join('\n')
  const closureNames = [...seen].map((f) => f.replace('assets/', ''))
  for (const [name, { chunk, content }] of Object.entries(HEAVY)) {
    // A rule that matches nothing anywhere in the build is stale and would make the guard vacuous.
    const exists = (chunk && assets.some((f) => chunk.test(f))) || (content && assets.some((f) => content.test(readFileSync(join(dist, 'assets', f), 'utf8'))))
    const leaked = [...(chunk ? closureNames.filter((f) => chunk.test(f)) : []), ...(content && content.test(closureText) ? ['(content signature)'] : [])]
    ok(`${name} is not in the login static closure`, Boolean(exists) && leaked.length === 0, !exists ? 'rule matches nothing in the whole build: update HEAVY' : leaked.join(', '))
  }
}

process.exit(results.every(Boolean) ? 0 : 1)
