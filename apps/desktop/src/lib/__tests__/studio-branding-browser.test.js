import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

test('actual dashboard card and module sidebar render Studio/fuchsia/PenTool from an old installed row', { timeout: 60000 }, async () => {
  const require = createRequire(new URL('../../../package.json', import.meta.url))
  const { build } = createRequire(new URL('../../../../../packages/module-compiler/package.json', import.meta.url))('esbuild')
  const { chromium } = require('playwright')
  const bundle = await build({ stdin: { contents: `
    import {createRoot} from 'react-dom/client';
    import {ModuleSidebar} from '@runly/ui';
    import {HomeAppTile} from './src/app/home/HomeAppTiles.jsx';
    import {mergeRuntimeModules} from './src/lib/runtime-modules-core.js';
    const old={key:'runly.studio',name:'Runly Studio',description:'Diseños editables con texto...',enabled:true,status:'INSTALLED',
      manifest:{icon:'Palette',color:'#2563eb',navigation:[{label:'Mis diseños',path:'/',icon:'Palette',permissionKey:'studio.view'}]}};
    const[module]=mergeRuntimeModules([old],{includeManifestFallback:false,preferApiNavigation:true});
    createRoot(document.getElementById('root')).render(<><section aria-label="Dashboard"><HomeAppTile module={module} onClick={()=>{}} onToggleFavorite={()=>{}}/></section>
      <section aria-label="Sidebar"><ModuleSidebar module={module} currentPath="/app/m/runly.studio" onNavigate={()=>{}} collapsed={false} contained/></section></>);`,
    resolveDir: fileURLToPath(new URL('../../../', import.meta.url)), loader: 'jsx' },
    bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false, loader: { '.css':'empty' },
    plugins: [{ name:'single-react-runtime',setup(build) {
      build.onResolve({filter:/^react(?:-dom)?(?:\/.*)?$/},args=>({path:require.resolve(args.path)}))
    } }] })
  const server = createServer((req,res) => {
    res.setHeader('Content-Type',req.url === '/app.js' ? 'text/javascript' : 'text/html')
    res.end(req.url === '/app.js' ? bundle.outputFiles[0].contents : '<div id="root"></div><script type="module" src="/app.js"></script>')
  })
  let browser
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
    browser = await chromium.launch({ channel:'chrome',headless:true })
    const page = await browser.newPage(); page.setDefaultTimeout(5000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const dashboard = page.getByRole('region',{name:'Dashboard'}), sidebar = page.getByRole('region',{name:'Sidebar'})
    try { await dashboard.getByText('Studio',{exact:true}).waitFor() } catch (error) { throw new Error(errors.join('; ') || error.message) }
    await sidebar.getByText('Studio',{exact:true}).waitFor()
    assert.equal(await page.getByText('Runly Studio',{exact:true}).count(),0)
    assert.equal(await page.locator('.lucide-palette').count(),0)
    assert.equal(await dashboard.locator('.lucide-pen-tool').count(),1)
    assert.ok(await sidebar.locator('.lucide-pen-tool').count() >= 1)
    assert.equal(await sidebar.locator('.lucide-pen-tool').first().evaluate(node=>getComputedStyle(node).color),'rgb(217, 70, 239)')
    assert.ok((await dashboard.locator('.lucide-pen-tool').evaluate(node=>getComputedStyle(node.parentElement).backgroundImage)).includes('217, 70, 239'))
    await dashboard.getByText('Diseño gráfico y edición multimedia',{exact:true}).waitFor()
  } finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)) }
})
