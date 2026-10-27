import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const source = path.resolve('infra/installer')
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'

for (const language of ['sh', 'ps1']) for (const mode of ['external', 'local']) {
  test(`${mode} ${language} refreshes its file list before download and preserves user files`, async t => {
    const executable = language === 'sh' ? bash : powershell
    if (spawnSync(executable, language === 'sh' ? ['--version'] : ['-NoProfile', '-Command', 'exit 0']).error) {
      return t.skip(`${executable} is unavailable`)
    }
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-bootstrap-refresh-'))
    t.after(async () => {
      assert.equal(path.dirname(root), path.resolve(os.tmpdir()))
      await fs.rm(root, { recursive: true, force: true })
    })
    const remote = path.join(root, 'remote')
    const target = path.join(root, 'install')
    await fs.mkdir(remote)
    await fs.mkdir(path.join(target, '.secrets/firebase'), { recursive: true })
    const credential = path.join(target, '.secrets/firebase/service-account.json')
    await fs.writeFile(credential, 'preserve-private-file')
    await fs.writeFile(path.join(target, '.env.external'), 'PRESERVE=true\n')
    if(mode==='local')await fs.mkdir(path.join(target,'supabase/volumes/db/studio-realtime-role.sql'),{recursive:true})
    const name = `bootstrap-${mode}.${language}`
    const text = (await fs.readFile(path.join(source, name), 'utf8')).replaceAll('\r\n', '\n')
    const fresh = language === 'sh'
      ? text.replace('files=(', 'files=(\n  new-helper.mjs')
      : text.replace('$files = @(', '$files = @(\n  "new-helper.mjs",')
    const script = path.join(target, name)
    await fs.writeFile(script, text)
    await fs.writeFile(path.join(remote, name), fresh)
    await fs.writeFile(path.join(remote, 'new-helper.mjs'), 'new-helper-content')
    const list = language === 'sh'
      ? text.match(/files=\(([\s\S]*?)\n\)/)[1].trim().split(/\s+/)
      : [...text.match(/\$files = @\(([\s\S]*?)\n\)/)[1].matchAll(/"([^"]+)"/g)].map(match => match[1])
    for (const file of list) {
      await fs.mkdir(path.dirname(path.join(remote, file)), { recursive: true })
      await fs.copyFile(path.join(source, file), path.join(remote, file))
    }
    const environment = { ...process.env, ATLAS_TEST_REMOTE: remote.replaceAll('\\', '/'), ATLAS_BOOTSTRAP_REFRESHED: '' }
    let args
    if (language === 'sh') {
      const harness = 'curl() { local relative="${3#*/infra/installer/}"; cp "$ATLAS_TEST_REMOTE/$relative" "$2"; }; export -f curl; bash "$1" --skip-run'
      args = ['-c', harness, 'bootstrap-test', script.replaceAll('\\', '/')]
    } else {
      const harness = path.join(root, 'harness.ps1')
      await fs.writeFile(harness, `param([string]$Bootstrap)
function global:Invoke-WebRequest {
  param([string]$Uri, [string]$OutFile)
  $relative = ($Uri -split '/infra/installer/', 2)[1]
  Copy-Item -LiteralPath (Join-Path $env:ATLAS_TEST_REMOTE $relative) -Destination $OutFile
}
& $Bootstrap ${mode === 'local' ? '-SkipRun' : '-SkipEnvCopy'}
`)
      args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness, script]
    }
    let result = spawnSync(executable, args, { cwd: target, env: environment, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(await fs.readFile(script, 'utf8'), fresh)
    assert.equal(await fs.readFile(path.join(target, 'new-helper.mjs'), 'utf8'), 'new-helper-content')
    assert.equal(await fs.readFile(path.join(target, '.env.external'), 'utf8'), 'PRESERVE=true\n')
    assert.equal(await fs.readFile(credential, 'utf8'), 'preserve-private-file')
    await fs.access(path.join(target, 'lib/firebase-config.mjs'))
    if(mode==='local'){
      const mounted=path.join(target,'supabase/volumes/db/studio-realtime-role.sql')
      assert.equal((await fs.stat(mounted)).isFile(),true)
      await fs.unlink(mounted);await fs.mkdir(mounted);await fs.writeFile(path.join(mounted,'keep.txt'),'preserve')
      const blocked=spawnSync(executable,args,{cwd:target,env:environment,encoding:'utf8',timeout:30000})
      assert.notEqual(blocked.status,0)
      assert.equal(await fs.readFile(path.join(mounted,'keep.txt'),'utf8'),'preserve')
    }
    // A failed bootstrap download must not overwrite the installed script.
    await fs.unlink(path.join(remote, name))
    result = spawnSync(executable, args, { cwd: target, env: environment, encoding: 'utf8', timeout: 30000 })
    assert.notEqual(result.status, 0)
    assert.equal(await fs.readFile(script, 'utf8'), fresh)
    assert.equal(await fs.readFile(credential, 'utf8'), 'preserve-private-file')
  })
}
