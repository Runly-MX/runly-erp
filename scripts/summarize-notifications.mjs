import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
// Prints a before/after table from two benchmark directories.
//   node scripts/summarize-notifications.mjs <beforeDir> [afterDir]
const load = async dir => Object.fromEntries(await Promise.all((await readdir(dir)).filter(f => /^n\d+\.json$/.test(f)).map(async f => { const j = JSON.parse(await readFile(join(dir, f), 'utf8')); return [j.users, j] })))
const [beforeDir, afterDir] = process.argv.slice(2).map(d => resolve(d))
const before = await load(beforeDir), after = afterDir ? await load(afterDir) : {}
const pick = (run, scenario) => run?.results.find(r => r.scenario === scenario)
const per = (r, key) => r ? (r[key] / r.seconds * 60) : null
const notif = r => r ? Object.entries(r.http).filter(([k]) => k.includes("/notifications")).reduce((a, [, v]) => a + v, 0) / r.seconds * 60 : null
const fmt = v => v == null ? '-' : Number.isInteger(v) ? String(v) : v.toFixed(1)
const rows = ['| users | scenario | HTTP/min b | a | notif HTTP/min b | a | SQL/min b | SQL/min a | API cpu s b | a | DB cpu s b | a | RT cpu s b | a | WS frames b | a | latency p50 b | a | p95 b | a | lost b | a |', '|' + '---|'.repeat(22)]
for (const n of Object.keys(before).map(Number).sort((a, b) => a - b)) for (const scenario of ['A_idle_bell_closed', 'C_bell_open', 'D_inbox_screen', 'E_nine_notifications', 'F_burst_100', 'H_two_tabs', 'J_realtime_outage']) {
  const b = pick(before[n], scenario), a = pick(after[n], scenario); if (!b && !a) continue
  const cpu = (r, s) => r?.cpuSeconds[s], ws = r => r ? r.ws.inCount + r.ws.outCount : null
  rows.push(`| ${n} | ${scenario} | ${fmt(per(b, 'httpTotal'))} | ${fmt(per(a, 'httpTotal'))} | ${fmt(notif(b))} | ${fmt(notif(a))} | ${fmt(per(b, 'sqlCalls'))} | ${fmt(per(a, 'sqlCalls'))} | ${fmt(cpu(b, 'runly-api'))} | ${fmt(cpu(a, 'runly-api'))} | ${fmt(cpu(b, 'supabase-db'))} | ${fmt(cpu(a, 'supabase-db'))} | ${fmt(cpu(b, 'supabase-realtime'))} | ${fmt(cpu(a, 'supabase-realtime'))} | ${fmt(ws(b))} | ${fmt(ws(a))} | ${fmt(b?.latency?.p50)} | ${fmt(a?.latency?.p50)} | ${fmt(b?.latency?.p95)} | ${fmt(a?.latency?.p95)} | ${fmt(b?.latency?.lost)} | ${fmt(a?.latency?.lost)} |`)
}
console.log(rows.join('\n'))
