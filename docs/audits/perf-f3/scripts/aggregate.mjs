// Usage: node aggregate.mjs <runsDir>  — median and spread (min..max, n) per variant/profile from runs.sh output.
import fs from 'node:fs'; import path from 'node:path'
const root = process.argv[2]
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const fmt = (a) => a.length ? `${Math.round(med(a) * 10) / 10} (${Math.round(Math.min(...a))}..${Math.round(Math.max(...a))}, n=${a.length})` : 'n/a'
const metrics = {
  'login visible ms': (c) => c.loginVisibleMs, 'login KB': (c) => c.preLogin.totalKB, 'login JS KB': (c) => c.preLogin.jsKB,
  'login requests': (c) => c.preLogin.requests, 'login FCP ms': (c) => c.preLogin.fcp, 'login LCP ms': (c) => c.preLogin.lcp,
  'login TBT ms': (c) => c.preLogin.tbt, 'login CLS': (c) => c.preLogin.cls, 'post-login KB': (c) => c.postLogin.totalKB,
  'post-login JS KB': (c) => c.postLogin.jsKB, 'post-login requests': (c) => c.postLogin.requests, 'login to usable ms': (c) => c.loginToQuietMs,
  'post-login TBT ms': (c) => c.postLoginPerf.tbt, 'post-login CLS': (c) => c.postLoginPerf.cls,
}
const sess = { 'warm reload ms': (s) => s.warmReloadMs, 'warm reload KB': (s) => s.warm.totalKB, 'warm reload requests': (s) => s.warm.requests,
  'warm API calls': (s) => s.warm.apiCalls, 'hot navigation ms': (s) => s.hotNavMs, 'hot navigation KB': (s) => s.hot.totalKB, 'hot navigation requests': (s) => s.hot.requests, 'session first-load KB': (s) => s.summary.totalKB, 'session first-load requests': (s) => s.summary.requests }
const rows = {}
for (const v of fs.readdirSync(root).filter((d) => fs.statSync(path.join(root, d)).isDirectory()))
  for (const p of fs.readdirSync(path.join(root, v)))
    for (const n of fs.readdirSync(path.join(root, v, p))) {
      const d = path.join(root, v, p, n)
      const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) } catch { return null } }
      const c = read(`res-${p}-cold.json`), s = read(`res-${p}-session.json`)
      for (const [k, f] of Object.entries(metrics)) if (c) (rows[`${p} | ${k}`] ??= {})[v] ??= [], c && rows[`${p} | ${k}`][v].push(f(c))
      for (const [k, f] of Object.entries(sess)) if (s) (rows[`${p} | ${k}`] ??= {})[v] ??= [], s && rows[`${p} | ${k}`][v].push(f(s))
    }
console.log('| Profile | Metric | Control (F3.0 state) median (min..max) | Candidate median (min..max) | Delta |\n|---|---|---|---|---|')
for (const [k, v] of Object.entries(rows)) {
  const [p, m] = k.split(' | '); const a = v.ctl ?? [], b = v.head ?? []
  const d = a.length && b.length && med(a) ? `${Math.round(((med(b) - med(a)) / med(a)) * 100)}%` : ''
  console.log(`| ${p} | ${m} | ${fmt(a)} | ${fmt(b)} | ${d} |`)
}
