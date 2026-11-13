import { useEffect, useRef, useState } from "react";
import { createAutoScroller } from "@runly/ui";

// Internal drag of files/folders between the explorer list/gallery, the folder
// tree and the breadcrumb. A custom MIME keeps it apart from OS file drags (uploads).
export const FILES_DND_MIME = "application/x-runly-files";

// How long a dragged item must hover a folder before it "springs" open.
export const SPRING_MS = 700;

// Starts the native drag and, while it lasts, scrolls the page when the pointer
// nears the top/bottom edge. It stops on drop/dragend, or when dragover stops
// (the source row can be unmounted by a spring-open navigation, so dragend may
// never arrive).
export function startItemDrag(event, payload, label) {
  event.dataTransfer.setData(FILES_DND_MIME, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "move";
  const ghost = document.createElement("div");
  ghost.textContent = label;
  ghost.style.cssText =
    "position:fixed;top:-100px;padding:4px 10px;border-radius:6px;font:500 12px system-ui;background:#1f2937;color:#fff";
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 0, 0);
  setTimeout(() => ghost.remove(), 0);

  const scroller = createAutoScroller(() => event.currentTarget ?? document.body);
  let lastSeen = Date.now();
  const track = (ev) => {
    lastSeen = Date.now();
    scroller.update(ev.clientY);
  };
  const watchdog = setInterval(() => Date.now() - lastSeen > 800 && stop(), 300);
  function stop() {
    clearInterval(watchdog);
    scroller.stop();
    window.removeEventListener("dragover", track);
    window.removeEventListener("dragend", stop, true);
    window.removeEventListener("drop", stop, true);
  }
  scroller.start();
  window.addEventListener("dragover", track);
  window.addEventListener("dragend", stop, true);
  window.addEventListener("drop", stop, true);
}

// Spread `props` on any element; `isOver` highlights it while an item hovers.
// `onSpring` runs once if the item keeps hovering for SPRING_MS (open the folder).
export function useItemDropTarget(onDropItems, onSpring) {
  const [isOver, setIsOver] = useState(false);
  const timer = useRef(null);
  const sprung = useRef(false);
  // dragenter/dragleave fire for every child element crossed and relatedTarget is
  // unreliable (null in Chrome/Safari), so count them instead of using contains().
  const depth = useRef(0);
  const springRef = useRef(onSpring);
  springRef.current = onSpring;
  const clear = () => {
    clearTimeout(timer.current);
    timer.current = null;
    sprung.current = false;
    depth.current = 0;
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!onDropItems) return { isOver: false, props: {} };
  const accepts = (e) => e.dataTransfer?.types?.includes(FILES_DND_MIME);
  return {
    isOver,
    props: {
      onDragOver: (e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsOver(true);
        if (springRef.current && !timer.current && !sprung.current) {
          timer.current = setTimeout(() => {
            sprung.current = true;
            timer.current = null;
            springRef.current?.();
          }, SPRING_MS);
        }
      },
      onDragEnter: (e) => {
        if (accepts(e)) depth.current += 1;
      },
      onDragLeave: (e) => {
        if (!accepts(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current > 0) return;
        setIsOver(false);
        clear();
      },
      onDrop: (e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setIsOver(false);
        clear();
        try {
          onDropItems(JSON.parse(e.dataTransfer.getData(FILES_DND_MIME)));
        } catch {
          /* malformed payload: ignore */
        }
      },
    },
  };
}
