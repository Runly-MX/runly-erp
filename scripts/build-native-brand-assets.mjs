import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = resolve(root, 'apps/desktop')

export function buildNativeBrandAssets() {
  const output = resolve(root, '.tmp/native-brand')
  mkdirSync(output, { recursive: true })
  // Current Runly masters. identity/runly-erp_* contains the historical Atlas A.
  // SVG wrappers are temporary: they preserve the supplied PNG artwork and let
  // Tauri generate every density without another raster-processing dependency.
  const brand = resolve(desktop, 'public/runly')
  const mark = readFileSync(resolve(brand, 'runly-isotipo-dark.png')).toString('base64')
  const image = `<image width="1280" height="1280" href="data:image/png;base64,${mark}"/>`
  const svg = (content, viewBox = '0 0 1280 1280') => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1280" viewBox="${viewBox}">${content}</svg>`
  const surface = '<rect width="1280" height="1280" fill="#070D18"/>'
  // Android masks the central 66dp of the 108dp foreground. Keep the complete
  // R inside that circular safe area, including its diagonal lower stroke.
  const safeArea = '-400 -400 2080 2080'
  writeFileSync(resolve(output, 'foreground.svg'), svg(image, safeArea))
  writeFileSync(resolve(output, 'background.svg'), svg(surface))
  writeFileSync(resolve(output, 'monochrome.svg'), svg(`<defs><filter id="silhouette" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"/></filter></defs><g filter="url(#silhouette)">${image}</g>`, safeArea))
  cpSync(resolve(brand, 'runly-app-icon-dark.png'), resolve(output, 'icon.png'))
  const manifest = resolve(output, 'icons.json')
  writeFileSync(manifest, JSON.stringify({ default: 'icon.png', bg_color: '#070D18', android_bg: 'background.svg', android_fg: 'foreground.svg', android_fg_scale: 85, android_monochrome: 'monochrome.svg' }))
  const result = spawnSync(process.execPath, [resolve(desktop, 'node_modules/@tauri-apps/cli/tauri.js'), 'icon', manifest, '--output', resolve(output, 'icons')], { cwd: desktop, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Native icon generation failed')
  // Tauri writes directly to an initialized mobile project, or exports here if absent.
  const android = resolve(desktop, 'src-tauri/gen/android/app/src/main/res')
  if (existsSync(android) && existsSync(resolve(output, 'icons/android'))) cpSync(resolve(output, 'icons/android'), android, { recursive: true })
  if (existsSync(resolve(android, 'mipmap-anydpi-v26/ic_launcher.xml'))) cpSync(resolve(android, 'mipmap-anydpi-v26/ic_launcher.xml'), resolve(android, 'mipmap-anydpi-v26/ic_launcher_round.xml'))
  if (existsSync(android)) {
    mkdirSync(resolve(android, 'values'), { recursive: true })
    writeFileSync(resolve(android, 'values/ic_launcher_background.xml'), '<resources><color name="ic_launcher_background">#070D18</color></resources>\n')
  }
  console.log('Runly native branding generated from public/runly masters')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildNativeBrandAssets()
