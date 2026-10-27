import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { canonical } from '../update-installer.mjs'

const source = resolve('infra/installer')
const ref = 'a'.repeat(40)
for (const language of ['sh', 'ps1']) for (const mode of ['local', 'external']) {
  test(`${mode} ${language} pins one commit, verifies the loader and downloads the complete verified release`, t => {
    const executable = language === 'sh' ? (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash') : (process.platform === 'win32' ? 'powershell.exe' : 'pwsh')
    assert.equal(Boolean(spawnSync(executable, language === 'sh' ? ['--version'] : ['-NoProfile', '-Command', 'exit 0']).error), false, 'required shell is available')
    const root = fs.mkdtempSync(join(tmpdir(), 'runly-bootstrap-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const target = join(root, 'install'), remote = join(root, 'remote')
    fs.mkdirSync(target); fs.mkdirSync(remote)
    const manifest = JSON.parse(fs.readFileSync(join(source, 'installer-release.json')))
    for (const file of [...Object.keys(manifest.files), 'installer-release.json']) {
      fs.mkdirSync(join(remote, file, '..'), { recursive: true })
      fs.writeFileSync(join(remote, file), canonical(fs.readFileSync(join(source, file))))
    }
    const bootstrap = join(target, `bootstrap-${mode}.${language}`)
    fs.copyFileSync(join(remote, `bootstrap-${mode}.${language}`), bootstrap)
    fs.writeFileSync(join(target, `.env.${mode}`), 'PRESERVE=true\n')
    fs.mkdirSync(join(target, '.secrets'), { recursive: true })
    fs.writeFileSync(join(target, '.secrets/keep'), 'private')
    fs.mkdirSync(join(target, 'supabase/volumes/db/studio-realtime-role.sql'), { recursive: true })
    const preload = join(root, 'fetch.mjs')
    fs.writeFileSync(preload, `import fs from 'node:fs';import path from 'node:path';globalThis.fetch=async url=>{const prefix='https://raw.githubusercontent.com/Runly-MX/runly-erp/${ref}/infra/installer/';if(!url.startsWith(prefix))throw Error('unexpected origin or revision');return new Response(fs.readFileSync(path.join(process.env.RUNLY_TEST_REMOTE,url.slice(prefix.length))))};`)
    const env = { ...process.env, RUNLY_TEST_REMOTE: remote, RUNLY_INSTALLER_REF: ref, NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` }
    let args
    if (language === 'sh') {
      const harness = 'curl() { local out="" previous="" arg; for arg in "$@"; do if [[ "$previous" == "-fsSLo" ]]; then out="$arg"; fi; previous="$arg"; done; cp "$RUNLY_TEST_REMOTE/update-installer.mjs" "$out"; }; export -f curl; bash "$1" --skip-run'
      args = ['-c', harness, 'bootstrap-test', bootstrap.replaceAll('\\', '/')]
    } else {
      const harness = join(root, 'harness.ps1')
      fs.writeFileSync(harness, 'param([string]$Bootstrap)\nfunction global:Invoke-WebRequest { param([string]$Uri,[string]$OutFile) Copy-Item -LiteralPath (Join-Path $env:RUNLY_TEST_REMOTE "update-installer.mjs") -Destination $OutFile }\n& $Bootstrap -SkipRun\n')
      args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness, bootstrap]
    }
    const run = () => spawnSync(executable, args, { cwd: target, env, encoding: 'utf8', timeout: 30000 })
    let result = run()
    assert.equal(result.status, 0, result.stdout + result.stderr)
    const state = JSON.parse(fs.readFileSync(join(target, '.runly-installer/state.json')))
    assert.equal(state.ref, ref); assert.equal(state.mode, mode)
    assert.equal(fs.readFileSync(join(target, `.env.${mode}`), 'utf8'), 'PRESERVE=true\n')
    assert.equal(fs.readFileSync(join(target, '.secrets/keep'), 'utf8'), 'private')
    for (const [file, entry] of Object.entries(manifest.files)) if (entry.modes.includes(mode)) assert.equal(fs.readFileSync(join(target, file), 'utf8'), fs.readFileSync(join(remote, file), 'utf8'))
    // A subsequent corrupted loader is rejected before installing or running it.
    fs.appendFileSync(join(remote, 'update-installer.mjs'), '\nthrow Error("tampered")\n')
    result = run()
    assert.notEqual(result.status, 0)
    assert.match(result.stdout + result.stderr, /INTEGRITY_FAILED/)
    assert.equal(JSON.parse(fs.readFileSync(join(target, '.runly-installer/state.json'))).ref, ref)
  })
}
