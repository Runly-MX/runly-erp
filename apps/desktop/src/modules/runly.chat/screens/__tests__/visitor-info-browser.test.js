import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

test('visitor panel keeps hook order and cleans countdowns across selection and closure', {
  skip: process.env.RUN_VISITOR_BROWSER_TESTS !== '1', timeout: 60_000,
}, async () => {
  const { chromium } = await import('playwright');
  const desktop = fileURLToPath(new URL('../../../../../', import.meta.url));
  const { build } = createRequire(join(desktop, '../api/package.json'))('esbuild');
  const screen = join(desktop, 'src/modules/runly.chat/screens/ExternalInboxScreen.jsx');
  const directory = await mkdtemp(join(tmpdir(), 'runly-visitor-panel-'));
  let server, browser;
  try {
    const mocks = {
      ui: `export const Badge=({children})=>children; export const EmptyState=()=>null; export const Skeleton=()=>null; export const renderMentionText=x=>x;`,
      icons: `export const MessageSquare=()=>null, Search=()=>null, ExternalLink=()=>null, Clock=()=>null, UserCheck=()=>null, ChevronDown=()=>null;`,
      chat: `export const ChatWindow=()=>null;`,
      inbox: `export const useExternalInbox=()=>({});`,
      query: `export const useQuery=()=>({}),useMutation=()=>({}),useQueryClient=()=>({});`,
      auth: `export const useAuth=()=>({});`,
      sdk: `export const runly={};`,
    };
    const mockFor = (path) => ({ '@runly/ui': 'ui', 'lucide-react': 'icons',
      '../components/ChatWindow': 'chat', '../hooks/useExternalInbox': 'inbox',
      '@tanstack/react-query': 'query', '../../../auth/AuthProvider': 'auth', '../../../lib/runly': 'sdk' })[path];
    await build({
      stdin: { resolveDir: desktop, loader: 'jsx', contents: `
        import React,{useState} from 'react';
        import {createRoot} from 'react-dom/client';
        import {VisitorInfoPanel} from './src/modules/runly.chat/screens/ExternalInboxScreen.jsx';
        const realSet=window.setInterval.bind(window),realClear=window.clearInterval.bind(window);
        const active=new Set();window.timerCount=()=>active.size;
        window.setInterval=(...args)=>{const id=realSet(...args);active.add(id);return id;};
        window.clearInterval=id=>{active.delete(id);return realClear(id);};
        function App(){const [conversation,setConversation]=useState(null);
          window.selectVisitor=setConversation;
          return <VisitorInfoPanel conversation={conversation}/>;
        }
        const root=createRoot(document.getElementById('root'));window.unmountVisitor=()=>root.unmount();
        root.render(<App/>);
      ` },
      bundle: true, outfile: join(directory, 'bundle.js'), jsx: 'automatic', logLevel: 'silent',
      alias: { react: join(desktop, 'node_modules/react'), 'react-dom': join(desktop, 'node_modules/react-dom') },
      plugins: [{ name: 'visitor-test-boundaries', setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path }) => {
          const mock = mockFor(path);
          if (mock) return { path: mock, namespace: 'mock' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: mocks[path], loader: 'jsx', resolveDir: desktop }));
        builder.onLoad({ filter: /ExternalInboxScreen\.jsx$/ }, async ({ path }) => {
          assert.equal(resolve(path), resolve(screen));
          // Expose the real private component only in this test bundle.
          return { contents: `${await readFile(path, 'utf8')}\nexport { VisitorInfoPanel };`, loader: 'jsx', resolveDir: dirname(path) };
        });
      } }],
    });
    server = createServer(async (request, response) => {
      response.setHeader('Content-Type', request.url === '/bundle.js' ? 'text/javascript' : 'text/html');
      response.end(request.url === '/bundle.js' ? await readFile(join(directory, 'bundle.js')) : '<div id="root"></div><script src="/bundle.js"></script>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(8_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => typeof window.selectVisitor === 'function');
    assert.equal(await page.locator('aside').count(), 0);
    assert.equal(await page.evaluate(() => window.timerCount()), 0);
    const conversation = { id: 'fixture', guest_name: 'Visitante de prueba', status: 'open', idle_expires_at: new Date(Date.now() + 600_000).toISOString() };
    const select = async (value) => {
      await page.evaluate(value => window.selectVisitor(value), value);
      // Flush React render and passive effects before inspecting interval cleanup.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    await select(conversation);
    await page.getByText('Sesion expira en', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.timerCount()), 1);
    await select(null);
    assert.equal(await page.locator('aside').count(), 0);
    assert.equal(await page.evaluate(() => window.timerCount()), 0, 'clearing selection must cancel the active interval');
    await select({ ...conversation, idle_expires_at: new Date(Date.now() + 180_000).toISOString() });
    await page.waitForFunction(() => document.querySelector('aside')?.textContent.includes('2m'));
    assert.equal(await page.evaluate(() => window.timerCount()), 1);
    await select({ ...conversation, status: 'closed' });
    assert.equal(await page.getByText('Sesion expira en', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.timerCount()), 0);
    await select({ ...conversation, idle_expires_at: undefined });
    assert.equal(await page.getByText('Sesion expira en', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.timerCount()), 0);
    await select({ ...conversation, idle_expires_at: undefined, idleExpiresAt: conversation.idle_expires_at });
    await page.getByText('Sesion expira en', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.timerCount()), 1);
    await page.evaluate(() => window.unmountVisitor());
    assert.equal(await page.evaluate(() => window.timerCount()), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error('Unexpected test artifact directory');
    await rm(directory, { recursive: true, force: true });
  }
});
