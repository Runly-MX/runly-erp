// Prefetch policy for the authenticated shell while the login form is on screen.
//
// Strategies (compared in docs/audits/RUNLY_PERFORMANCE_F3_2_RESULTS.md, prefetch matrix):
//   none      never prefetch
//   idle      prefetch shell + landing screen as soon as the browser is idle (the previous behaviour)
//   adaptive  prefetch shell + landing screen only on an intent signal (the person focuses, types in or presses
//             inside the form), never on data-saving or slow connections, never in a hidden page
//   selective like adaptive, shell only (the landing screen loads when the route is entered)
// The default is chosen by measurement; a lab can override it with window.__runlyPrefetch (strategy name only).

const loadShell = () => import("../app/AuthenticatedShell.jsx").catch(() => {});
const loadLanding = () => import("../app/HomeScreen").catch(() => {});

export function connectionAllowsPrefetch(connection = typeof navigator === "undefined" ? undefined : navigator.connection) {
  // No Network Information API (Safari, Firefox): the absence of data is not permission to download.
  // That case is handled by waiting for intent, which does not need connection data.
  if (!connection) return true;
  if (connection.saveData) return false;
  return !["slow-2g", "2g", "3g"].includes(connection.effectiveType);
}

export function resolveStrategy(defaultStrategy = "adaptive") {
  const forced = typeof window !== "undefined" ? window.__runlyPrefetch : undefined;
  return ["none", "idle", "adaptive", "selective"].includes(forced) ? forced : defaultStrategy;
}

// Returns a cleanup function. `form` is the element whose interaction signals intent.
export function startShellPrefetch(form, { strategy = resolveStrategy(), doc = document, win = window, connection } = {}) {
  if (strategy === "none") return () => {};
  const run = () => {
    if (doc.visibilityState !== "visible") return;
    loadShell();
    if (strategy !== "selective") loadLanding();
  };
  const schedule = () =>
    typeof win.requestIdleCallback === "function"
      ? win.requestIdleCallback(run, { timeout: 1500 })
      : win.setTimeout(run, 300);

  if (strategy === "idle") {
    if (!connectionAllowsPrefetch(connection)) return () => {};
    const id = typeof win.requestIdleCallback === "function" ? win.requestIdleCallback(run, { timeout: 4000 }) : win.setTimeout(run, 2000);
    return () => (typeof win.cancelIdleCallback === "function" && typeof id === "number" ? win.cancelIdleCallback(id) : win.clearTimeout(id));
  }

  // adaptive and selective: wait for intent.
  if (!form) return () => {};
  let done = false;
  const onIntent = () => {
    if (done) return;
    done = true;
    cleanup();
    if (connectionAllowsPrefetch(connection)) schedule();
  };
  const events = ["focusin", "input", "pointerdown", "keydown"];
  const cleanup = () => events.forEach((name) => form.removeEventListener(name, onIntent, true));
  events.forEach((name) => form.addEventListener(name, onIntent, true));
  return cleanup;
}
