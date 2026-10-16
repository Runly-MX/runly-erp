import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const browserModule = process.env.RUNLY_BROWSER_TEST_MODULE;
test('MCP screen: all requests use the frontend origin and preserve web authorization', { skip: !browserModule, timeout: 60000 }, async () => {
  const { chromium } = await import(pathToFileURL(browserModule).href);
  const { build } = createRequire(new URL('../../../../api/package.json', import.meta.url))('esbuild');
  const directory = await mkdtemp(join(tmpdir(), 'runly-mcp-screen-'));
  const desktop = fileURLToPath(new URL('../../../', import.meta.url));
  let server, browser, denyAccount = false, revoked = false;
  const requests = [];
  try {
    await build({
      stdin: { resolveDir: desktop, loader: 'jsx', contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {BrowserRouter} from 'react-router-dom';
        import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
        import {McpConnectionScreen} from './src/app/McpConnectionScreen.jsx';
        import {getApiUrl} from './src/lib/runtimeConfig.js';
        window.erpApiUrl=getApiUrl;
        const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
        createRoot(document.getElementById('root')).render(<BrowserRouter>
          <QueryClientProvider client={client}><McpConnectionScreen/></QueryClientProvider>
        </BrowserRouter>);
      ` },
      bundle: true, outfile: join(directory, 'bundle.js'), jsx: 'automatic', logLevel: 'silent',
      alias: { react: join(desktop, 'node_modules/react'), 'react-dom': join(desktop, 'node_modules/react-dom'), '@tanstack/react-query': join(desktop, 'node_modules/@tanstack/react-query') },
      plugins: [{ name: 'test-session', setup(builder) {
        builder.onResolve({ filter: /\/auth\/AuthProvider$/ }, () => ({ path: 'auth', namespace: 'mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export const useAuth=()=>({session:{access_token:'test-web-session',user:{id:'test-user'}}});`, loader: 'js' }));
      } }],
    });
    server = createServer(async (request, response) => {
      if (request.url === '/bundle.js') {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end(await readFile(join(directory, 'bundle.js')));
        return;
      }
      if (!request.url.startsWith('/mcp/')) {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<div id="root"></div><script>window.__RUNLY_RUNTIME_CONFIG__={RUNLY_API_URL:'https://api.example.test'};</script><script src="/bundle.js"></script>`);
        return;
      }
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ path: request.url, method: request.method, headers: request.headers, body });
      response.setHeader('Content-Type', 'application/json');
      if (request.headers.authorization !== 'Bearer test-web-session' || denyAccount) {
        response.writeHead(403).end(JSON.stringify({ error: 'permission_denied', error_description: 'Acceso denegado.' }));
      } else if (request.url === '/mcp/account/revoke') {
        revoked = true;
        response.end(JSON.stringify({ revoked: true }));
      } else if (request.url === '/mcp/account') {
        response.end(JSON.stringify({ companies: [{ id: 'company-a', name: 'Empresa de prueba' }], grants: revoked ? [] : [{ id: 'grant-a', clientName: 'Cliente de prueba', scopes: ['runly:read'] }] }));
      } else if (request.url.startsWith('/mcp/oauth/request/')) {
        response.end(JSON.stringify({ clientName: 'Cliente de prueba', redirectUri: 'https://client.example/callback', scopes: ['runly:read'] }));
      } else if (request.url === '/mcp/oauth/consent') {
        response.end(JSON.stringify({ redirect: '/completed' }));
      } else if (request.url.startsWith('/mcp/proposals/')) {
        response.end(JSON.stringify(request.method === 'POST' ? { approved: body.approve } : { companyId: 'company-a', sensitive: request.url.includes('sensitive'), preview: { title: 'Propuesta de prueba', fields: [{ label: 'Nombre', value: 'Equipo' }] }, proposed: { effects: ['Guardar cambios y notificar destinatarios.'] } }));
      } else response.writeHead(404).end('{}');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    const outgoing = [], errors = [];
    page.on('request', request => outgoing.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`${origin}/app/mcp`);
    await page.getByRole('button', { name: 'Revocar', exact: true }).click().catch(async error => {
      throw new Error(`${error.message}\nBrowser errors: ${errors.join('; ')}\n${await page.locator('body').innerText()}`);
    });
    await page.getByRole('dialog').getByRole('button', { name: 'Revocar', exact: true }).click();
    await page.getByText('Sin conexiones activas').waitFor();
    assert.deepEqual(requests.find(r => r.path === '/mcp/account/revoke').body, { grantId: 'grant-a' });

    await page.goto(`${origin}/app/mcp?request=request-a`);
    const authorize = page.getByRole('button', { name: 'Autorizar', exact: true });
    await authorize.waitFor();
    assert.equal(await authorize.isDisabled(), true);
    await page.getByRole('checkbox').click();
    await authorize.click();
    await page.waitForURL(`${origin}/completed`);
    assert.deepEqual(requests.find(r => r.path === '/mcp/oauth/consent').body, { requestId: 'request-a', companyIds: ['company-a'], approve: true });

    await page.goto(`${origin}/app/mcp?request=request-denied`);
    await page.getByRole('button', { name: 'Rechazar', exact: true }).click();
    await page.waitForURL(`${origin}/completed`);
    assert.deepEqual(requests.filter(r => r.path === '/mcp/oauth/consent').at(-1).body, { requestId: 'request-denied', companyIds: [], approve: false });

    for (const approve of [true, false]) {
      await page.goto(`${origin}/app/mcp?proposal=proposal-a`);
      await page.getByText('Propuesta de prueba', { exact: true }).waitFor();
      await page.getByRole('button', { name: approve ? 'Aprobar propuesta' : 'Rechazar', exact: true }).click();
      await page.getByRole('status').waitFor();
      assert.deepEqual(requests.filter(r => r.path === '/mcp/proposals/proposal-a' && r.method === 'POST').at(-1).body, { approve });
    }
    for (const id of ['sensitive-a', 'sensitive-b']) {
      await page.goto(`${origin}/app/mcp?proposal=${id}`);
      await page.getByText('Guardar cambios y notificar destinatarios.', { exact: true }).waitFor();
      const approve = page.getByRole('button', { name: 'Aprobar propuesta', exact: true });
      assert.equal(await approve.isDisabled(), true);
      assert.equal(await page.getByRole('checkbox').isChecked(), false);
      await page.getByRole('checkbox').click();
      await approve.click();
      await page.getByRole('status').waitFor();
      assert.deepEqual(requests.filter(r => r.path === `/mcp/proposals/${id}` && r.method === 'POST').at(-1).body, { approve: true, acknowledgeSensitive: true });
    }
    denyAccount = true;
    await page.goto(`${origin}/app/mcp`);
    await page.getByText('Acceso denegado.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.erpApiUrl()), 'https://api.example.test');
    assert.ok(outgoing.every(url => new URL(url).origin === origin), 'No request may go to the separate ERP API origin');
    for (const request of requests) {
      assert.equal(request.headers.host, new URL(origin).host);
      assert.equal(request.headers.authorization, 'Bearer test-web-session');
      if (request.method === 'POST') assert.equal(request.headers['content-type'], 'application/json');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error('Unexpected test artifact directory');
    await rm(directory, { recursive: true, force: true });
  }
});
