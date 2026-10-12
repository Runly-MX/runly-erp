// Install helpers for the Checador mini app (pure, testable).
export function isStandalone(win = globalThis.window) {
  if (!win) return false
  return Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches || win.navigator?.standalone === true)
}

export function isIosSafari(ua = globalThis.navigator?.userAgent ?? '', maxTouchPoints = globalThis.navigator?.maxTouchPoints ?? 0) {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)
  return ios && !/CriOS|FxiOS|EdgiOS/i.test(ua) ? true : false
}
