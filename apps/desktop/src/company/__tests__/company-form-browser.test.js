import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'node:http'

// Optional real-browser regression, using Node's test runner. Point
// RUNLY_BROWSER_TEST_MODULE at an installed playwright/index.mjs and install Chrome.
const browserModule = process.env.RUNLY_BROWSER_TEST_MODULE
test('company forms survive access polling, token rotation and background updates', { skip: !browserModule }, async () => {
  const { chromium } = await import(pathToFileURL(browserModule).href)
  const apiRequire = createRequire(new URL('../../../../api/package.json', import.meta.url))
  const { build } = apiRequire('esbuild')
  const directory = await mkdtemp(join(tmpdir(), 'runly-company-form-'))
  let server, browser
  try {
    const auth = `import React from 'react';
      export const Context = React.createContext(null);
      export const useAuth = () => ({...React.useContext(Context),profileCompanyId:window.activeCompany});`
    const sdk = `export let company = 'company-a';
      export const getActiveCompanyId = () => company;
      export const setActiveCompanyId = (id) => { company = id; window.activeCompany=id };
      export const runly = {
        memberships: { me: async () => {
          window.membershipRequests++;
          await new Promise(r => setTimeout(r, 20));
          if(window.failMemberships) throw Object.assign(new Error('network'),{status:503});
          return structuredClone(window.memberships);
        } },
        company: {
          pendingDeletions: async () => ({data:window.jobs??[]}),
          requestDeletion: async (id) => {
            window.requestedDeletion=id;
            window.savedMemberships=structuredClone(window.memberships.data);
            window.memberships.data=window.memberships.data.filter(m=>m.companyId!==id);
            window.jobs=[{companyId:id,name:'A',state:'PENDING',purgeAfter:'2099-01-01',canRestore:true}];
            return {data:{notice:{sent:0,failed:1,reasons:['smtp_attachment_unavailable']}}};
          },
          cancelDeletion: async (id) => {window.cancelledDeletion=id;window.memberships.data=window.savedMemberships;window.jobs=[];return {data:{}}},
          getProfile: async () => { window.profileRequests++; return {data:{ ...window.companyProfile, id:company }} },
          updateProfile: async (data) => { window.companyProfile=data; return {data} },
        },
      };`
    const ui = `import React from 'react';
      export const Card=({children})=><div>{children}</div>;
      export const Button=({children,loading,variant,size,...props})=><button {...props}>{children}</button>;
      export const PageHeader=()=>null, ErrorState=()=>null, Skeleton=()=>null, ConfirmDialog=()=>null;
      export const EmptyState=({title,description})=><section><h2>{title}</h2><p>{description}</p></section>;
      export const TextField=({label,hint,...props})=><label>{label}<input aria-label={label} {...props}/></label>;
      export const CheckboxField=({label,hint,...props})=><label>{label}<input type="checkbox" aria-label={label} {...props}/></label>;
      export const Dialog=({open,children})=>open?<div role="dialog">{children}</div>:null;
      export const DialogContent=({children})=><div>{children}</div>;
      export const DialogTitle=DialogContent,DialogDescription=DialogContent,DialogFooter=DialogContent;
      export const Alert=DialogContent,AlertTitle=DialogContent,AlertDescription=DialogContent;
      export const SelectField=({label,value,onValueChange,options,disabled})=><label>{label}<select aria-label={label} value={value} onChange={e=>onValueChange(e.target.value)} disabled={disabled}><option value=""/>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
      export const ComboboxField=({onChange,onValueChange,...props})=><SelectField {...props} onValueChange={onValueChange??onChange}/>;`
    const mocks = {
      auth,
      sdk,
      ui,
      loader: `export const AppLoader=()=>null`,
      floats: `export const useChatFloatStore={setState(){}}`,
      toast: `export const toast={success(){},error(){},warning(message){window.mailWarning=message}}`,
    }
    await build({
      stdin: {
        resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'jsx', contents: `
          import React, {useEffect,useState} from 'react';
          import {createRoot} from 'react-dom/client';
          import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
          import {Context} from '../auth/AuthProvider';
          import {ActiveCompanyProvider,ActiveCompanyGate,useActiveCompany} from './ActiveCompanyProvider.jsx';
          import CompanyProfile from '../modules/runly.company/screens/CompanyProfile.jsx';
          window.membershipRequests=0; window.profileRequests=0; window.mounts=0; window.profileRefreshes=0;window.forbiddenRequests=0;
          window.memberships={authorizationRevision:'global-1',data:[
            {companyId:'company-a',authorizationRevision:'access-a',company:{id:'company-a',name:'A'}},
            {companyId:'company-b',authorizationRevision:'access-b',company:{id:'company-b',name:'B'}}]};
          if(window.startWithoutCompanies) window.memberships.data=[];
          window.companyProfile={name:'Server name',companyType:'sa_de_cv',companySize:'micro'};
          const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:60000,refetchOnWindowFocus:false}}});
          window.client=client;
          function Form(){useEffect(()=>{window.mounts++},[]);const scope=useActiveCompany();window.switchCompany=scope.setActiveCompany;
            useQuery({queryKey:['business-probe',scope.activeCompanyId],queryFn:async()=>{
              if(!window.memberships.data.some(m=>m.companyId===window.activeCompany)){window.forbiddenRequests++;throw new Error('Forbidden company')}
              return 'authorized';
            }});return <CompanyProfile/>}
          function App(){const [token,setToken]=useState('token-1');window.rotateToken=()=>setToken('token-2');
            return <Context.Provider value={{session:{access_token:token,user:{id:'user-a'}},userProfile:{isAdmin:true},refreshProfile:()=>{window.profileRefreshes++}}}>
              <ActiveCompanyProvider><ActiveCompanyGate><Form/></ActiveCompanyGate></ActiveCompanyProvider>
            </Context.Provider>}
          createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><App/></QueryClientProvider>);
        `,
      },
      bundle: true, outfile: join(directory, 'bundle.js'), jsx: 'automatic', logLevel: 'silent',
      plugins: [{ name: 'test-boundaries', setup(builder) {
        builder.onResolve({ filter: /AuthProvider$/ }, () => ({ path: 'auth', namespace: 'mock' }))
        builder.onResolve({ filter: /\/lib\/runly$/ }, () => ({ path: 'sdk', namespace: 'mock' }))
        builder.onResolve({ filter: /chatFloatStore\.js$/ }, () => ({ path: 'floats', namespace: 'mock' }))
        builder.onResolve({ filter: /AppLoader$/ }, () => ({ path: 'loader', namespace: 'mock' }))
        builder.onResolve({ filter: /^@runly\/ui$/ }, () => ({ path: 'ui', namespace: 'mock' }))
        builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'mock' }))
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: mocks[path], loader: 'jsx', resolveDir: fileURLToPath(new URL('../../../', import.meta.url)) }))
      } }],
    })
    server = createServer(async (request, response) => {
      response.setHeader('Content-Type', request.url === '/bundle.js' ? 'text/javascript' : 'text/html')
      response.end(request.url === '/bundle.js' ? await readFile(join(directory, 'bundle.js')) : '<div id="root"></div><script src="/bundle.js"></script>')
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage()
    page.setDefaultTimeout(10_000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const name = page.getByLabel('Nombre comercial', { exact: true })
    await name.waitFor()
    await name.fill('Unsaved draft')
    await page.getByLabel('Tipo de empresa', { exact: true }).selectOption('srl')
    // Exercise actual background polls, including an unrelated global revision.
    for (let revision = 2; revision <= 5; revision++) {
      await page.evaluate(async revision => {
        window.memberships.authorizationRevision = `global-${revision}`
        window.memberships.data[0].company.logoUrl = `signed-${revision}`
        await window.client.refetchQueries({queryKey:['memberships-me']})
      }, revision)
    }
    await page.evaluate(() => window.rotateToken())
    await page.evaluate(async () => {
      window.companyProfile.name='Server changed during editing'
      await window.client.invalidateQueries({queryKey:['company-profile']})
      window.failMemberships=true
      await window.client.refetchQueries({queryKey:['memberships-me']})
      window.failMemberships=false
      await window.client.refetchQueries({queryKey:['memberships-me']})
    })
    assert.equal(await name.inputValue(), 'Unsaved draft')
    assert.equal(await page.getByLabel('Tipo de empresa', { exact: true }).inputValue(), 'srl')
    assert.equal(await page.evaluate(() => window.mounts), 1)
    assert.equal(await page.evaluate(() => window.profileRequests), 2)
    assert.equal(await page.evaluate(() => window.profileRefreshes), 1)
    // A genuine authorization change must still evict old resource data.
    await page.evaluate(async () => {
      window.client.setQueryData(['private-note'], {body:'previously authorized'})
      window.memberships.data[0].authorizationRevision='access-a-revoked'
      await window.client.refetchQueries({queryKey:['memberships-me']})
    })
    await page.waitForFunction(() => window.profileRefreshes === 2)
    assert.equal(await page.evaluate(() => window.client.getQueryData(['private-note'])), undefined)
    await page.evaluate(() => window.switchCompany('company-b'))
    await page.waitForFunction(() => window.mounts === 2)
    await page.waitForFunction(() => document.querySelector('input[aria-label="Nombre comercial"]')?.value === 'Server changed during editing')
    await page.evaluate(async () => {
      window.memberships.data = window.memberships.data.filter(m => m.companyId !== 'company-b')
      await window.client.refetchQueries({queryKey:['memberships-me']})
    })
    await page.waitForFunction(() => window.mounts === 3)
    await page.evaluate(async () => {
      window.savedMemberships=structuredClone(window.memberships.data)
      window.memberships.data=[]
      await window.client.refetchQueries({queryKey:['memberships-me']})
    })
    await page.getByText('Tu cuenta no tiene acceso a ninguna empresa',{exact:true}).waitFor()
    assert.equal(await name.count(),0,'the ERP form must unmount after losing the last membership')
    await page.evaluate(async () => {
      window.memberships.data=window.savedMemberships
      await window.client.refetchQueries({queryKey:['memberships-me']})
    })
    await name.waitFor()
    // Schedule the last company through the real modal. A mail failure must
    // still leave the ERP, clear the tenant header and offer recovery.
    await page.getByRole('button',{name:'Eliminar esta empresa',exact:true}).click()
    await page.getByLabel(/Escribe .*A.* para confirmar/).fill('A')
    await page.getByLabel('Confirma tu contrase\u00f1a',{exact:true}).fill('fixture-password')
    await page.getByRole('button',{name:'Suspender y programar eliminaci\u00f3n',exact:true}).click()
    await name.waitFor({state:'detached'})
    await page.getByRole('button',{name:/Cancelar .* y recuperar empresa/i}).waitFor()
    assert.equal(await page.evaluate(()=>window.activeCompany),null)
    assert.equal(await page.evaluate(()=>localStorage.getItem('runly-active-company')),null)
    assert.match(await page.evaluate(()=>window.mailWarning),/eliminaci\u00f3n sigue programada/)
    assert.match(await page.evaluate(()=>window.mailWarning),/Falta una imagen/)
    await page.getByRole('button',{name:/Cancelar .* y recuperar empresa/i}).click()
    await name.waitFor()
    assert.equal(await page.evaluate(()=>window.activeCompany),'company-a')
    // With another membership, suspension selects that company immediately.
    await page.evaluate(async()=>{
      window.memberships.data.push({companyId:'company-b',authorizationRevision:'access-b',company:{id:'company-b',name:'B'}})
      await window.client.refetchQueries({queryKey:['memberships-me']})
    })
    await page.getByRole('button',{name:'Eliminar esta empresa',exact:true}).click()
    await page.getByLabel(/Escribe .*A.* para confirmar/).fill('A')
    await page.getByLabel('Confirma tu contrase\u00f1a',{exact:true}).fill('fixture-password')
    await page.getByRole('button',{name:'Suspender y programar eliminaci\u00f3n',exact:true}).click()
    await page.waitForFunction(()=>window.activeCompany==='company-b')
    await name.waitFor()
    await page.getByRole('heading',{name:'Eliminaciones de otras empresas',exact:true}).waitFor()
    assert.equal(await page.evaluate(()=>window.requestedDeletion),'company-a')
    assert.deepEqual(await page.evaluate(()=>window.jobs.map(job=>job.companyId)),['company-a'])
    assert.equal(await page.getByText(/Estas solicitudes corresponden a otras empresas/).textContent(),
      'Estas solicitudes corresponden a otras empresas que administras. No afectan a «B», la empresa abierta.')
    const notice = page.getByText(/^A: eliminaci\u00f3n programada$/)
    await notice.waitFor()
    assert.equal(await notice.evaluate(element => Boolean(
      document.querySelector('input[aria-label="Nombre comercial"]').compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
    )),true,'another company deletion must not appear as a status above the active profile')
    await page.getByRole('button',{name:'Recuperar empresa',exact:true}).click()
    await page.getByRole('heading',{name:'Eliminaciones de otras empresas',exact:true}).waitFor({state:'detached'})
    assert.equal(await page.evaluate(()=>window.cancelledDeletion),'company-a')
    assert.equal(await page.evaluate(()=>window.activeCompany),'company-b','recovery must preserve the active company')
    assert.equal(await page.evaluate(()=>window.forbiddenRequests),0)
    // A persisted company from an earlier session must also be cleared when
    // the initial membership response has no companies.
    await page.addInitScript(() => {
      window.startWithoutCompanies=true
      localStorage.setItem('runly-active-company','company-a')
    })
    await page.reload()
    await page.getByRole('button',{name:'Volver a comprobar acceso',exact:true}).waitFor()
    await page.waitForFunction(()=>window.activeCompany===null)
    assert.equal(await page.evaluate(()=>localStorage.getItem('runly-active-company')),null)
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    if (server) await new Promise(resolve => server.close(resolve))
    if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error('Unexpected test artifact directory')
    await rm(directory, { recursive: true, force: true })
  }
})
