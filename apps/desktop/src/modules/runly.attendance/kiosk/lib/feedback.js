// Sensory feedback and device helpers: haptics, beeps, wake lock, fullscreen.
let audioCtx = null

export function haptic(pattern = 12) {
  try { navigator.vibrate?.(pattern) } catch { /* unsupported */ }
}

function tone(freq, startAt, duration, gain = 0.18) {
  const ctx = audioCtx
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  amp.gain.setValueAtTime(0.0001, ctx.currentTime + startAt)
  amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + startAt + 0.02)
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration)
  osc.connect(amp).connect(ctx.destination)
  osc.start(ctx.currentTime + startAt)
  osc.stop(ctx.currentTime + startAt + duration + 0.05)
}

export function beep(kind) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    audioCtx ??= new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    if (kind === 'in') { tone(740, 0, 0.12); tone(988, 0.12, 0.18) }
    else if (kind === 'out') { tone(988, 0, 0.12); tone(740, 0.12, 0.18) }
    else if (kind === 'info') tone(660, 0, 0.15)
    else { tone(220, 0, 0.18, 0.22); tone(180, 0.22, 0.28, 0.22) }
  } catch { /* audio blocked until a gesture */ }
}

export async function requestWakeLock() {
  try { return (await navigator.wakeLock?.request('screen')) ?? null } catch { return null }
}

export function toggleFullscreen() {
  const el = document.documentElement
  if (document.fullscreenElement) return document.exitFullscreen?.()
  return el.requestFullscreen?.().catch(() => {})
}

export const fullscreenSupported = () => typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen)

export function deviceLabel() {
  const ua = navigator.userAgent || ''
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Dispositivo'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  return `${browser} en ${os} (${window.screen?.width ?? '?'}x${window.screen?.height ?? '?'})`
}
