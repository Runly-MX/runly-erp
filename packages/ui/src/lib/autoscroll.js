const EDGE = 64;
const MAX_SPEED = 18;

function scrollParent(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const overflow = getComputedStyle(n).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement;
}

const clamp = (v) => Math.max(0, Math.min(1, v));

// Scrolls the list's scroll container while a drag / marquee pointer sits near its
// top or bottom edge. Feed it the pointer Y; `onScroll` lets callers refresh state.
export function createAutoScroller(getEl, onScroll) {
  let raf = 0;
  let y = null;
  let parent = null;
  function loop() {
    if (y != null && parent) {
      const isPage = parent === document.scrollingElement;
      const rect = isPage ? { top: 0, bottom: window.innerHeight } : parent.getBoundingClientRect();
      const up = clamp((rect.top + EDGE - y) / EDGE);
      const down = clamp((y - (rect.bottom - EDGE)) / EDGE);
      const speed = Math.round((down - up) * MAX_SPEED);
      if (speed) {
        parent.scrollTop += speed;
        onScroll?.();
      }
    }
    raf = requestAnimationFrame(loop);
  }
  return {
    start() {
      parent = scrollParent(getEl());
      y = null;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    },
    update(value) {
      y = value;
    },
    stop() {
      cancelAnimationFrame(raf);
      y = null;
    },
  };
}
