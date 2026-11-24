// Inert frontend probe: only observes what the sandbox allows and writes the
// findings into its own DOM (read by the browser test). It contacts nothing.
window.addEventListener('runly:ready', async () => {
  const attempt = async (fn) => { try { const value = await fn(); return { ok: true, value: value === undefined ? null : String(value).slice(0, 80) } } catch (e) { return { ok: false, code: e && (e.code || e.name) || 'Error' } } }
  const results = {
    origin: String(window.origin),
    parentDom: await attempt(() => window.parent.document.title),
    topLocation: await attempt(() => window.top.location.href),
    localStorage: await attempt(() => window.localStorage.getItem('sb-runly-auth-token')),
    parentStorage: await attempt(() => window.parent.localStorage.length),
    cookie: await attempt(() => document.cookie),
    indexedDb: await attempt(() => new Promise((resolve, reject) => { const r = indexedDB.open('probe'); r.onsuccess = () => resolve('opened'); r.onerror = () => reject(r.error) })),
    fetchHost: await attempt(() => fetch(document.referrer || 'http://127.0.0.1/', { mode: 'no-cors' }).then(() => 'fetched')),
    globalsWithToken: Object.keys(window).filter((k) => /token|session|supabase|auth/i.test(k) && k !== 'sessionStorage'),
    sessionStorage: await attempt(() => window.sessionStorage.length),
    popup: await attempt(() => { const w = window.open('about:blank'); if (!w) throw Object.assign(new Error('blocked'), { code: 'POPUP_BLOCKED' }); return 'opened' }),
    deniedOperation: await attempt(() => window.runly.call('records.create', { entity: 'solicitud', data: {} })),
    allowedOperation: await attempt(() => window.runly.call('records.list', { entity: 'solicitud' }).then((rows) => rows.length)),
  }
  // A forged window-level message must not be treated as host traffic by the bridge.
  window.parent.postMessage({ v: 'runly.frame/v1', id: 'forged', op: 'records.create', args: {} }, '*')
  const root = document.getElementById('root')
  root.textContent = JSON.stringify(results)
  root.dataset.state = 'probed'
  // Last: try to navigate the host away (sandbox without allow-top-navigation must block it).
  try { window.top.location.href = 'about:blank#hijacked' } catch (e) { root.dataset.navigation = 'blocked:' + (e.name || 'Error') }
})
