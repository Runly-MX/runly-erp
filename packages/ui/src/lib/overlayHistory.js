// Back-gesture support for modals and sheets on touch devices (mobile web and
// the APK). Each open overlay owns one history entry; the system back gesture
// pops it and closes the topmost overlay instead of leaving the page.
const stack = [];
let ignorePops = 0;
let listening = false;

function onPopState() {
  if (ignorePops > 0) {
    ignorePops -= 1;
    return;
  }
  const top = stack.pop();
  top?.close();
}

export function overlayHistoryEnabled() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse), (max-width: 767px)").matches;
}

// Returns an unregister function to call when the overlay closes on its own.
export function registerOverlay(close) {
  if (!listening) {
    window.addEventListener("popstate", onPopState);
    listening = true;
  }
  const entry = { close };
  stack.push(entry);
  // Keep the router's own state keys so it sees the same location afterwards.
  window.history.pushState({ ...window.history.state, runlyOverlay: true }, "");
  return () => {
    const index = stack.indexOf(entry);
    if (index === -1) return; // already closed by the back gesture
    stack.splice(index, 1);
    // Only drop our entry if nothing navigated on top of it meanwhile.
    if (window.history.state?.runlyOverlay) {
      ignorePops += 1;
      window.history.back();
    }
  };
}
