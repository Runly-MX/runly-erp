import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_MS = 4000;

// Immersive call chrome: when `autoHide` is on, the top bar and controls fade
// out after a few idle seconds and come back on any tap/move. `pinned` keeps
// them visible (a menu or sheet is open).
export function useChromeVisibility({ autoHide, pinned = false }) {
  const [visible, setVisible] = useState(true);
  const timer = useRef(null);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    if (!autoHide || pinned) return;
    timer.current = setTimeout(() => setVisible(false), IDLE_MS);
  }, [autoHide, pinned]);

  const reveal = useCallback(() => {
    setVisible(true);
    schedule();
  }, [schedule]);

  // Tap on the stage toggles (like a video player); other activity reveals.
  const toggle = useCallback(() => {
    if (!autoHide) return;
    setVisible((current) => {
      const next = !current;
      if (next) schedule();
      else clearTimeout(timer.current);
      return next;
    });
  }, [autoHide, schedule]);

  useEffect(() => {
    if (!autoHide || pinned) {
      clearTimeout(timer.current);
      setVisible(true);
      return undefined;
    }
    schedule();
    return () => clearTimeout(timer.current);
  }, [autoHide, pinned, schedule]);

  return { visible: visible || !autoHide || pinned, reveal, toggle };
}
