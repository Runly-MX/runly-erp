import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

test('Studio opt-in guard survives save/reopen and protects BrowserRouter links and native Back', { timeout: 60000 }, async () => {
  const require = createRequire(new URL('../../../package.json', import.meta.url))
  const { build } = createRequire(new URL('../../../../../packages/module-compiler/package.json', import.meta.url))('esbuild')
  const { chromium } = require('playwright')
  const bundle = await build({ stdin: { contents: `
    import {useState} from 'react';import {createRoot} from 'react-dom/client';
    import {BrowserRouter,useSearchParams,Link} from 'react-router-dom';
    import {useStudioNavigation} from './src/modules/runly.studio/hooks/useStudioNavigation.js';
    function Editor({back}){const[dirty,setDirty]=useState(false);const nav=useStudioNavigation(dirty,()=>{});
      return <><input aria-label="Draft" onChange={()=>setDirty(true)}/><button onClick={()=>setDirty(false)}>Save</button>
      <button onClick={back}>Back</button><Link to="?other=1">Other module</Link>
      {nav.pending&&<div role="dialog"><button onClick={nav.cancel}>Cancel</button><button onClick={nav.proceed}>Leave</button></div>}</>}
    function App(){const[p,set]=useSearchParams();return p.has('doc')?<Editor back={()=>set({})}/>:<button onClick={()=>set({doc:'1'})}>Open</button>}
    createRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);`, resolveDir: fileURLToPath(new URL('../../../', import.meta.url)), loader:'jsx' },
    bundle:true,platform:'browser',format:'esm',jsx:'automatic',write:false })
  const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:'<div id="root"></div><script type="module" src="/app.js"></script>')})
  let browser
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    browser=await chromium.launch({channel:'chrome',headless:true})
    const page=await browser.newPage();page.setDefaultTimeout(3000)
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    for(let cycle=0;cycle<2;cycle++) {
      await page.getByRole('button',{name:'Open',exact:true}).click()
      await page.getByLabel('Draft').fill(`draft-${cycle}`)
      await page.getByRole('button',{name:'Back',exact:true}).click()
      await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click()
      await page.getByRole('link',{name:'Other module',exact:true}).click()
      await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click()
      await page.evaluate(()=>history.back())
      await page.getByRole('dialog').waitFor()
      await page.getByRole('button',{name:'Cancel',exact:true}).click()
      assert.ok(new URL(page.url()).searchParams.has('doc'))
      await page.getByRole('button',{name:'Save',exact:true}).click()
      await page.getByRole('button',{name:'Back',exact:true}).click()
      await page.getByRole('button',{name:'Open',exact:true}).waitFor()
    }
    await page.evaluate(()=>history.back())
    await page.getByLabel('Draft').fill('forward-protected')
    await page.evaluate(()=>history.forward())
    await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Leave',exact:true}).click()
    await page.getByRole('button',{name:'Open',exact:true}).waitFor()
    await page.getByRole('button',{name:'Open',exact:true}).click();await page.getByLabel('Draft').fill('confirmed-link')
    await page.getByRole('link',{name:'Other module',exact:true}).click();await page.getByRole('button',{name:'Leave',exact:true}).click()
    await page.getByRole('button',{name:'Open',exact:true}).waitFor()
    assert.ok(new URL(page.url()).searchParams.has('other'))
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve))}
})
