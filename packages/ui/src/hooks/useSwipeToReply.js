import { useMemo, useRef, useState } from "react";

const H_RATIO = 1.5;       // |dx| must exceed |dy| * H_RATIO to count as horizontal
const MAX_TRANSLATE = 96;  // rubber-band cap

// Pure, injectable controller. `direction` is "right" for received messages
// (drag right to reply) and "left" for own messages (drag left). `onTranslate`
// receives the signed px offset the caller should apply as translateX.
export function createSwipeController({ threshold = 64, direction = "right", onReply, onTranslate, onThresholdCross } = {}) {
  let start = null;         // { x, y, el, pointerId }
  let horizontal = false;
  let engaged = false;
  let captured = null;      // { el, pointerId } once the swipe is claimed
  const sign = direction === "left" ? -1 : 1;

  function releaseCapture() {
    if (captured) {
      try { captured.el?.releasePointerCapture?.(captured.pointerId); } catch { /* noop */ }
      captured = null;
    }
  }

  function reset() {
    releaseCapture();
    start = null;
    horizontal = false;
    engaged = false;
    onTranslate?.(0);
  }

  return {
    onPointerDown(e) {
      start = { x: e.clientX, y: e.clientY, el: e.currentTarget, pointerId: e.pointerId };
      horizontal = false;
      engaged = false;
      // Do NOT setPointerCapture here. Capturing the whole message row on
      // every press makes Chromium retarget the synthesized `click` to the
      // row, silently killing every button/link inside the bubble. Capture
      // lazily in onPointerMove once we know this is actually a swipe.
    },
    onPointerMove(e) {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!horizontal) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        horizontal = Math.abs(dx) > Math.abs(dy) * H_RATIO;
        if (!horizontal) { start = null; return; } // vertical intent -> yield to scroll
        // Leave the opposite direction available to a parent gesture (for
        // example, swiping out of a conversation instead of replying).
        if (dx * sign <= 0) { reset(); return; }
        // Now that it's a swipe, claim the pointer so we keep getting moves
        // even if the finger slides off the row. A drag produces no `click`,
        // so this no longer breaks button activation.
        try {
          start.el?.setPointerCapture?.(start.pointerId);
          captured = { el: start.el, pointerId: start.pointerId };
        } catch { /* noop */ }
      }
      const projected = dx * sign;                // positive when swiping the intended way
      if (projected <= 0) { onTranslate?.(0); return; }
      const clamped = Math.min(projected, MAX_TRANSLATE);
      const nowEngaged = projected >= threshold;
      // Tactile tick when the swipe arms (not on every move past it).
      if (nowEngaged && !engaged) onThresholdCross?.();
      engaged = nowEngaged;
      onTranslate?.(clamped * sign);
    },
    onPointerUp() {
      const shouldFire = engaged;
      reset();
      if (shouldFire) onReply?.();
    },
    onPointerCancel() { reset(); },
  };
}

export function useSwipeToReply({ onReply, threshold = 64, direction = "right", disabled = false, onThresholdCross = null } = {}) {
  const [translateX, setTranslateX] = useState(0);
  const cb = useRef(onReply);
  cb.current = onReply;
  const crossCb = useRef(onThresholdCross);
  crossCb.current = onThresholdCross;

  const handlers = useMemo(() => {
    if (disabled) return {};
    const ctrl = createSwipeController({
      threshold,
      direction,
      onReply: () => cb.current?.(),
      onTranslate: setTranslateX,
      onThresholdCross: () => crossCb.current?.(),
    });
    return {
      onPointerDown: (e) => ctrl.onPointerDown(e),
      onPointerMove: (e) => ctrl.onPointerMove(e),
      onPointerUp: () => ctrl.onPointerUp(),
      onPointerCancel: () => ctrl.onPointerCancel(),
    };
  }, [threshold, direction, disabled]);

  return { handlers, translateX };
}
