// Detection is a UI routing aid. Native ACL/origin checks are the security boundary.
export function detectRuntime(scope = globalThis) {
  const win = scope.window ?? scope
  const available = typeof win.__TAURI_INTERNALS__?.invoke === 'function'
  if (available) {
    const platform = win.__RUNLY_NATIVE_HOST__?.platform
    const ua = win.navigator?.userAgent ?? ''
    if (platform === 'android' || /Android/i.test(ua)) return 'tauri-android'
    if (platform === 'ios' || /iPhone|iPad|iPod/i.test(ua)) return 'tauri-ios'
    return 'tauri-desktop'
  }
  return win.matchMedia?.('(display-mode: standalone)')?.matches || win.navigator?.standalone === true ? 'pwa' : 'web'
}

export const isNativeMobile = (scope) => ['tauri-android', 'tauri-ios'].includes(detectRuntime(scope))
export const isNativeDesktop = (scope) => detectRuntime(scope) === 'tauri-desktop'
export function isBundledDesktop(scope = globalThis) {
  const win = scope.window ?? scope
  return isNativeDesktop(scope) && !win.__RUNLY_NATIVE_HOST__
}
export const isNative = (scope) => detectRuntime(scope).startsWith('tauri-')
