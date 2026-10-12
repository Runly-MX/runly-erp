import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renameInstaller } from './rename-installer.mjs'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: desktop, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('La compilación de Windows falló.')
}

// Signing identity and commands belong to the build machine, never the repository.
const signCommand = process.env.RUNLY_WINDOWS_SIGN_COMMAND
const thumbprint = process.env.RUNLY_WINDOWS_CERTIFICATE_THUMBPRINT
if (signCommand && thumbprint) throw new Error('Configura un comando de firma o un certificado, no ambos.')
if (process.env.RUNLY_WINDOWS_REQUIRE_SIGNATURE === '1' && !signCommand && !thumbprint) {
  throw new Error('Se requiere configurar la firma del instalador de Windows.')
}
const windows = signCommand ? { signCommand } : thumbprint ? {
  certificateThumbprint: thumbprint,
  digestAlgorithm: 'sha256',
  timestampUrl: process.env.RUNLY_WINDOWS_TIMESTAMP_URL || 'http://timestamp.digicert.com',
} : {}
const config = resolve(desktop, '../../.tmp/windows-host/build-config.json')
mkdirSync(dirname(config), { recursive: true })
writeFileSync(config, JSON.stringify({ bundle: { windows } }))
if (!signCommand && !thumbprint) console.log('Compilación local sin firma de editor. SmartScreen puede mostrar una advertencia.')
run([resolve(desktop, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', '--config', config])
const installer = renameInstaller(desktop)
if (signCommand || thumbprint) {
  const check = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "foreach ($artifact in @($env:RUNLY_SIGN_VERIFY_APP, $env:RUNLY_SIGN_VERIFY_SETUP)) { if ((Get-AuthenticodeSignature -LiteralPath $artifact).Status -ne 'Valid') { exit 1 } }"], {
    cwd: desktop, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, RUNLY_SIGN_VERIFY_APP: resolve(desktop, 'src-tauri/target/release/runly_erp.exe'), RUNLY_SIGN_VERIFY_SETUP: installer },
  })
  if (check.error) throw check.error
  if (check.status !== 0) throw new Error('La firma Authenticode del ejecutable o del instalador no es válida.')
}
console.log(`Instalador: ${installer}`)
