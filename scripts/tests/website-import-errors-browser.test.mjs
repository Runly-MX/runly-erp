import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {dirname,resolve} from 'node:path'
import {chromium} from 'playwright'

const require=createRequire(new URL('../../apps/desktop/package.json',import.meta.url))
const {build}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('esbuild')

test('ZIP error notice names the file, escapes its markup and can be dismissed with the keyboard',async()=>{
  const file='<img src=x onerror="window.injected=true">.md'
  const bundle=await build({
    stdin:{resolveDir:resolve('apps/desktop'),sourcefile:'import-error-test.jsx',loader:'jsx',contents:`
      import {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {ErrorNotice} from './src/modules/runly.website/components/ErrorNotice.jsx';
      function Test(){const [error,setError]=useState({code:'unexpected_archive_file',status:422,fields:{archivo:${JSON.stringify(file)},motivo:'La extensión no está permitida. Excluye este archivo del ZIP.'}});return <ErrorNotice error={error} onDismiss={()=>setError(null)}/>}
      createRoot(document.getElementById('root')).render(<Test/>);
    `},
    bundle:true,write:false,jsx:'automatic',platform:'browser',format:'esm',
    alias:{react:dirname(require.resolve('react')),'react-dom/client':require.resolve('react-dom/client')},
    plugins:[{name:'ui-components',setup(b){
      b.onResolve({filter:/^@runly\/ui$/},()=>({path:'ui',namespace:'test-ui'}))
      b.onLoad({filter:/.*/,namespace:'test-ui'},()=>({contents:`export {Alert,AlertTitle,AlertDescription} from ${JSON.stringify(resolve('packages/ui/src/components/Alert.jsx'))};export {Button} from ${JSON.stringify(resolve('packages/ui/src/components/Button.jsx'))};`,resolveDir:process.cwd()}))
    }}],
  })
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type',req.url==='/entry.js'?'text/javascript':'text/html; charset=utf-8')
    res.end(req.url==='/entry.js'?bundle.outputFiles[0].contents:'<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module" src="/entry.js"></script>')
  })
  server.listen(0,'127.0.0.1');await once(server,'listening')
  let browser
  try {
    browser=await chromium.launch({headless:true})
    const page=await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const notice=page.getByRole('alert');await notice.waitFor()
    assert.ok((await notice.textContent()).includes(file))
    assert.match(await notice.textContent(),/Excluye este archivo/)
    assert.equal(await notice.locator('img').count(),0)
    assert.equal(await page.evaluate(()=>window.injected),undefined)
    await page.getByRole('button',{name:'Descartar aviso'}).focus()
    await page.keyboard.press('Enter')
    await notice.waitFor({state:'detached'})
  }finally{
    await browser?.close()
    await new Promise(resolve=>server.close(resolve))
  }
})
