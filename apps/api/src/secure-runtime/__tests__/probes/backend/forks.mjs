// Inert resource probe: tries to start many sleeping processes; the PID limit must stop it.
import { spawn } from 'node:child_process'
export default async function forks() {
  let started = 0, refused = null
  const children = []
  for (let i = 0; i < 200; i++) {
    try { const c = spawn('sleep', ['5'], { stdio: 'ignore' }); await new Promise((resolve, reject) => { c.once('spawn', resolve); c.once('error', reject) }); children.push(c); started++ } catch (error) { refused = error.code ?? 'ERROR'; break }
  }
  for (const c of children) c.kill('SIGKILL')
  return { started, refused }
}
