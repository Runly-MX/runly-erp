// Runs website-domains.mjs `setup` once, at the end of an install or update, when this instance has Website
// custom domains turned on. After it succeeds the systemd timer exists and later runs skip it: the timer keeps
// certificates in sync on its own. It never fails the install: anything missing becomes a printed next step.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { resolveInstanceIdentity } from './instance-identity.mjs'

const value = (content, key) => content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*$`, 'm'))?.[1]?.replace(/^(['"])(.*)\1$/, '$2') ?? ''
export const timerFile = (prefix) => `/etc/systemd/system/runly-website-domains-${prefix}.timer`

// Pure decision, tested on its own.
export function websiteDomainsAction({ platform, envContent, timerExists, nginxPresent, isRoot, sudoAvailable }) {
  if (platform !== 'linux') return 'skip-platform'
  if (/^(off|false|0|no)$/i.test(value(envContent, 'RUNLY_WEBSITE_TLS_AUTOMATION'))) return 'skip-opted-out'
  if (!value(envContent, 'RUNLY_WEBSITE_CUSTOM_DOMAIN_TARGET')) return 'skip-disabled'
  if (timerExists) return 'skip-done'
  if (!nginxPresent) return 'skip-no-nginx'
  if (isRoot) return 'run'
  return sudoAvailable ? 'run-sudo' : 'manual'
}

export function autoSetupWebsiteDomains({ installerDir, mode, envContent, log = console.log }) {
  const prefix = resolveInstanceIdentity(envContent).containerPrefix
  const ok = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0
  const action = websiteDomainsAction({
    platform: process.platform,
    envContent,
    timerExists: fs.existsSync(timerFile(prefix)),
    nginxPresent: ok('nginx', ['-v']),
    isRoot: process.getuid?.() === 0,
    sudoAvailable: ok('sudo', ['-n', 'true']),
  })
  const script = path.join(installerDir, 'website-domains.mjs')
  const manual = `sudo node ${script} setup --mode=${mode}`
  if (action === 'skip-done') { log('Website domains: HTTPS automation already configured on this server (timer active).'); return action }
  if (action === 'skip-no-nginx') { log(`Website domains: custom domains are on but nginx is not installed on this server. Install nginx and certbot, then run: ${manual}`); return action }
  if (action === 'manual') { log(`Website domains: run once with administrator rights to automate HTTPS for custom domains: ${manual}`); return action }
  if (!action.startsWith('run')) return action
  log('Website domains: configuring HTTPS automation for custom domains on this server (one time)...')
  const argv = [script, 'setup', `--mode=${mode}`]
  const result = action === 'run' ? spawnSync(process.execPath, argv, { stdio: 'inherit' }) : spawnSync('sudo', ['-n', process.execPath, ...argv], { stdio: 'inherit' })
  if (result.status !== 0) log(`Website domains: the automatic setup did not finish (see above). Fix it and run: ${manual}. Runly itself is running.`)
  return action
}
