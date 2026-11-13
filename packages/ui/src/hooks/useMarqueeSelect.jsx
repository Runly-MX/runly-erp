import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createAutoScroller } from "../lib/autoscroll.js";

const THRESHOLD = 4;

// Rubber-band (drag-an-area) selection for mouse users, like a desktop file
// explorer. Put `containerRef` on a `position: relative` element, spread
// `onPointerDown` on it and render `marqueeNode` inside it. Items are the
// elements matching `itemSelector`, each carrying its id in `data-<idAttr>`.
//
// - starts on a left-button mouse press that is not on `ignoreSelector`
// - becomes a selection only after THRESHOLD px, so plain clicks are untouched
// - Ctrl / Cmd / Shift keep the current selection (`getSelectedIds`)
// - a press+release on empty space (no item under it) clears the selection
// - scrolls the page/container while the pointer sits near its top/bottom edge
// - swallows the click that follows a real drag so it does not open an item
export function useMarqueeSelect({
  itemSelector = "[data-item-id]",
  idAttr = "itemId",
  ignoreSelector = "button,[role=checkbox],input,a,[role=menu]",
  getSelectedIds,
  onSelect,
  disabled = false,
}) {
  const containerRef = useRef(null);
  const [rect, setRect] = useState(null);
  const latest = useRef({});
  latest.current = { getSelectedIds, onSelect, itemSelector, idAttr };
  const scrollerRef = useRef(null);
  const cleanup = useRef(null);

  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = useCallback(
    (e) => {
      if (disabled || e.button !== 0 || e.pointerType !== "mouse") return;
      if (e.target.closest(ignoreSelector)) return;
      const box = containerRef.current;
      if (!box) return;
      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
      const base = additive ? latest.current.getSelectedIds() : [];
      const onItem = Boolean(e.target.closest(latest.current.itemSelector));
      const origin = box.getBoundingClientRect();
      // Stored relative to the container, so it stays put while the page scrolls.
      const start = { x: e.clientX - origin.left, y: e.clientY - origin.top };
      let last = e;
      let active = false;

      const update = (ev) => {
        const r = box.getBoundingClientRect();
        const x = ev.clientX - r.left;
        const y = ev.clientY - r.top;
        const area = { left: Math.min(start.x, x), top: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
        if (!active && Math.hypot(x - start.x, y - start.y) < THRESHOLD) return;
        active = true;
        setRect(area);
        const { itemSelector: sel, idAttr: attr } = latest.current;
        const hit = [];
        box.querySelectorAll(sel).forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.left - r.left < area.left + area.width && b.right - r.left > area.left && b.top - r.top < area.top + area.height && b.bottom - r.top > area.top) {
            const id = el.dataset[attr];
            if (id) hit.push(id);
          }
        });
        latest.current.onSelect([...new Set([...base, ...hit])]);
      };
      const move = (ev) => {
        last = ev;
        scrollerRef.current?.update(ev.clientY);
        update(ev);
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        scrollerRef.current?.stop();
        document.body.style.userSelect = "";
        cleanup.current = null;
      };
      function up() {
        stop();
        setRect(null);
        if (active) {
          // The click that ends a drag must not open/toggle whatever is under the pointer.
          const swallow = (ev) => ev.stopPropagation();
          window.addEventListener("click", swallow, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
        } else if (!additive && !onItem) latest.current.onSelect([]);
      }

      scrollerRef.current ??= createAutoScroller(() => containerRef.current, () => scrollerRef.current?.onScroll?.());
      scrollerRef.current.onScroll = () => update(last);
      scrollerRef.current.start();
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      cleanup.current = stop;
    },
    [disabled, ignoreSelector],
  );

  const marqueeNode = useMemo(
    () =>
      rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 border border-[var(--brand-primary)] bg-[var(--brand-primary)]/15"
          style={rect}
        />
      ) : null,
    [rect],
  );

  return { containerRef, onPointerDown, marqueeNode };
}
