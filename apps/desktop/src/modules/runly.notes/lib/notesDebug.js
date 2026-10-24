// Dev aid for the S Pen / IME investigation. Enabled with ?notesDebug=1 or
// localStorage runly:notes:debug=1. No-op otherwise.
function enabled() {
  try {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('notesDebug') === '1'
      || window.localStorage.getItem('runly:notes:debug') === '1'
  } catch {
    return false
  }
}

export function notesDebug(event, detail) {
  if (!enabled()) return
  console.debug(`[notes/debug ${Math.round(performance.now())}ms] ${event}`, detail ?? '')
}
